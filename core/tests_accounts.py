import time

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from . import totp
from .models import ChangeLogEntry, Comment, Party, PartyMember, Proposal, Question, Topic, TotpDevice

User = get_user_model()
PASSWORD = "kodikos-dokimis-9"
FIELDS = dict(problem="π", action="α", legal="ν", cost="κ", tradeoffs="τ", timeline="χ", metric="μ")


def make_member(email, party):
    user = User.objects.create_user(email, email, PASSWORD)
    PartyMember.objects.create(user=user, party=party)
    return user


class TotpTests(TestCase):
    def test_rfc6238_vector(self):
        secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # "12345678901234567890"
        self.assertEqual(totp.code_now(secret, now=59), "287082")
        self.assertEqual(totp.code_now(secret, now=1111111109), "081804")

    def test_replay_and_window(self):
        secret = totp.new_secret()
        now = 1_000_000
        code = totp.code_now(secret, now=now)
        counter = totp.verify(secret, code, 0, now=now)
        self.assertIsNotNone(counter)
        self.assertIsNone(totp.verify(secret, code, counter, now=now))        # επανάληψη
        self.assertIsNone(totp.verify(secret, code, 0, now=now + 300))        # ληγμένος
        self.assertIsNone(totp.verify(secret, "abcdef", 0, now=now))


class AccountTests(TestCase):
    def setUp(self):
        self.topic = Topic.objects.create(name="Θέμα", slug="th")
        self.a = Party.objects.create(name="Α", responsible_persons="x", is_published=True)
        self.b = Party.objects.create(name="Β", responsible_persons="y", is_published=True)
        self.user_a = make_member("a@example.org", self.a)
        self.user_b = make_member("b@example.org", self.b)

    def password_step(self, email="a@example.org", password=PASSWORD):
        return self.client.post(reverse("login"), {"email": email, "password": password})

    def full_login(self, email="a@example.org"):
        self.password_step(email)
        self.client.get(reverse("totp"))  # δημιουργεί το κλειδί στην πρώτη είσοδο
        device = TotpDevice.objects.get(user__username=email)
        return self.client.post(reverse("totp"), {"code": totp.code_now(device.secret)})

    def test_login_requires_both_factors(self):
        r = self.password_step()
        self.assertRedirects(r, reverse("totp"), fetch_redirect_response=False)
        # μόνο με κωδικό δεν υπάρχει πρόσβαση
        self.assertRedirects(self.client.get(reverse("manage")), reverse("login"), fetch_redirect_response=False)
        self.assertEqual(self.client.get(reverse("totp")).context["setup"], True)
        r = self.full_login()
        self.assertRedirects(r, reverse("manage"), fetch_redirect_response=False)
        self.assertEqual(self.client.get(reverse("manage")).status_code, 200)

    def test_wrong_password_and_wrong_code(self):
        r = self.password_step(password="λάθος")
        self.assertEqual(r.status_code, 200)
        self.password_step()
        r = self.client.post(reverse("totp"), {"code": "000000"})
        self.assertEqual(r.status_code, 200)
        self.assertRedirects(self.client.get(reverse("manage")), reverse("login"), fetch_redirect_response=False)

    def test_code_cannot_be_replayed(self):
        self.full_login()
        code = totp.code_now(TotpDevice.objects.get(user=self.user_a).secret)
        self.client.post(reverse("logout"))
        self.password_step()
        r = self.client.post(reverse("totp"), {"code": code})
        self.assertEqual(r.status_code, 200)  # ίδιος κωδικός, απορρίπτεται
        self.assertRedirects(self.client.get(reverse("manage")), reverse("login"), fetch_redirect_response=False)

    def test_superuser_goes_to_admin_not_party_panel(self):
        User.objects.create_superuser("root", "root@example.org", PASSWORD)
        r = self.password_step("root", PASSWORD)
        self.assertRedirects(r, "/admin/", fetch_redirect_response=False)
        home = self.client.get(reverse("home"))
        self.assertContains(home, 'href="/admin/"')
        self.assertContains(home, "Αποσύνδεση")
        self.assertRedirects(self.client.get(reverse("manage")), reverse("login"), fetch_redirect_response=False)

    def test_unified_login_routes_by_role(self):
        r = self.password_step()  # εκπρόσωπος κόμματος
        self.assertRedirects(r, reverse("totp"), fetch_redirect_response=False)

    def test_old_citizen_login_url_redirects(self):
        r = self.client.get(reverse("citizen_login"), {"next": "/thema/x/"})
        self.assertRedirects(r, reverse("login") + "?next=%2Fthema%2Fx%2F", fetch_redirect_response=False)

    @override_settings(FD_LOGIN_RATE_HOUR=3)
    def test_login_lockout(self):
        for _ in range(3):
            self.password_step(password="λάθος")
        r = self.password_step()  # ακόμη και ο σωστός κωδικός μπλοκάρεται
        self.assertEqual(r.status_code, 200)
        self.assertIn("όριο", r.content.decode())

    def test_profile_edit_logs_change(self):
        self.full_login()
        r = self.client.post(reverse("profile_edit"), {
            "slogan": "Νέο σύνθημα", "founders": "Ιδρυτής", "funding": "", "website": "",
        })
        self.assertEqual(r.status_code, 302)
        self.a.refresh_from_db()
        self.assertEqual(self.a.slogan, "Νέο σύνθημα")
        entry = ChangeLogEntry.objects.get(party=self.a)
        self.assertIn("Σύνθημα", entry.summary)
        page = self.client.get(reverse("party", args=[self.a.slug])).content.decode()
        self.assertIn("Ενημερώθηκε το προφίλ", page)

    def test_party_cannot_change_protected_fields(self):
        self.full_login()
        self.client.post(reverse("profile_edit"), {
            "slogan": "x", "is_published": "", "graduated": "on", "tier": "full", "kind": "group",
            "responsible_persons": "Άλλος",
        })
        self.a.refresh_from_db()
        self.assertFalse(self.a.graduated)
        self.assertEqual(self.a.tier, Party.TIER_PROGRESS)
        self.assertEqual(self.a.responsible_persons, "x")

    def test_proposal_create_edit_and_isolation(self):
        self.full_login()
        data = dict(topic=self.topic.pk, title="Τίτλος", is_published="on", source="https://example.org/pigi", **FIELDS)
        r = self.client.post(reverse("proposal_new"), data)
        self.assertEqual(r.status_code, 302)
        prop = Proposal.objects.get(party=self.a)
        self.assertIn("Νέα πρόταση", ChangeLogEntry.objects.get(party=self.a).summary)
        data["title"] = "Νέος τίτλος"
        self.client.post(reverse("proposal_edit", args=[prop.pk]), data)
        prop.refresh_from_db()
        self.assertEqual(prop.title, "Νέος τίτλος")
        self.assertEqual(ChangeLogEntry.objects.filter(party=self.a).count(), 2)
        # το άλλο κόμμα δεν μπορεί να την επεξεργαστεί
        self.client.post(reverse("logout"))
        self.full_login("b@example.org")
        self.assertEqual(self.client.get(reverse("proposal_edit", args=[prop.pk])).status_code, 404)
        self.assertEqual(self.client.post(reverse("proposal_edit", args=[prop.pk]), data).status_code, 404)

    def test_proposal_word_limit_enforced(self):
        self.full_login()
        data = dict(topic=self.topic.pk, title="Τ", **FIELDS)
        data["problem"] = " ".join(["λέξη"] * 151)
        r = self.client.post(reverse("proposal_new"), data)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Proposal.objects.count(), 0)

    def test_official_reply_rules(self):
        prop = Proposal.objects.create(party=self.a, topic=self.topic, title="Τ", **FIELDS)
        q = Question.objects.create(topic=self.topic, pseudonym="π", body="Ερώτημα;")
        # ανώνυμος: όχι
        self.assertRedirects(
            self.client.post(reverse("official_reply", args=["protasi", prop.pk]), {"body": "x"}),
            reverse("login"), fetch_redirect_response=False,
        )
        # το κόμμα Β δεν απαντά για πρόταση του Α
        self.full_login("b@example.org")
        r = self.client.post(reverse("official_reply", args=["protasi", prop.pk]), {"body": "x"})
        self.assertEqual(r.status_code, 404)
        # αλλά απαντά σε ερώτημα πολίτη
        self.client.post(reverse("official_reply", args=["erotima", q.pk]), {"body": "Απάντηση Β"})
        c = Comment.objects.get()
        self.assertEqual(c.official_party, self.b)
        page = self.client.get(reverse("question", args=[q.pk])).content.decode()
        self.assertIn("Επίσημη απάντηση: Β", page)
        # το Α απαντά στη δική του πρόταση και φαίνεται η φόρμα
        self.client.post(reverse("logout"))
        self.full_login("a@example.org")
        self.assertContains(self.client.get(reverse("proposal", args=[prop.pk])), "Επίσημη απάντηση ως")
        self.client.post(reverse("official_reply", args=["protasi", prop.pk]), {"body": "Απάντηση Α"})
        self.assertEqual(Comment.objects.filter(proposal=prop, official_party=self.a).count(), 1)

    def test_unpublished_party_cannot_reply(self):
        self.a.is_published = False
        self.a.save()
        q = Question.objects.create(topic=self.topic, pseudonym="π", body="Ερώτημα;")
        self.full_login()
        self.client.post(reverse("official_reply", args=["erotima", q.pk]), {"body": "x"})
        self.assertEqual(Comment.objects.count(), 0)

    def test_max_three_members_per_party(self):
        from django.core.exceptions import ValidationError
        make_member("a2@example.org", self.a)
        make_member("a3@example.org", self.a)
        u = User.objects.create_user("a4@example.org", "a4@example.org", PASSWORD)
        with self.assertRaises(ValidationError):
            PartyMember(user=u, party=self.a).clean()

    def test_invite_member_command(self):
        from django.core.management import call_command
        call_command("invite_member", "new@example.org", "Α")
        self.assertTrue(PartyMember.objects.filter(user__username="new@example.org", party=self.a).exists())


class DemoPartyLoginTests(TestCase):
    """Με FD_DEMO_LOGINS τα κόμματα δείγματος μπαίνουν χωρίς 2FA· τα πραγματικά κόμματα ζητούν πάντα 2FA."""

    def _member(self, example):
        from django.contrib.auth import get_user_model

        from .models import Party, PartyMember

        party = Party.objects.create(name="Δοκιμή", responsible_persons="x", is_example=example)
        user = get_user_model().objects.create_user("m@example.org", "m@example.org", "kodikos-12345")
        PartyMember.objects.create(user=user, party=party)

    def test_example_party_skips_2fa_when_enabled(self):
        self._member(True)
        with self.settings(FD_DEMO_LOGINS=True):
            r = self.client.post(reverse("login"), {"email": "m@example.org", "password": "kodikos-12345"})
        self.assertRedirects(r, reverse("manage"), fetch_redirect_response=False)

    def test_example_party_needs_2fa_when_disabled(self):
        self._member(True)
        with self.settings(FD_DEMO_LOGINS=False):
            r = self.client.post(reverse("login"), {"email": "m@example.org", "password": "kodikos-12345"})
        self.assertRedirects(r, reverse("totp"), fetch_redirect_response=False)

    def test_real_party_always_needs_2fa(self):
        self._member(False)
        with self.settings(FD_DEMO_LOGINS=True):
            r = self.client.post(reverse("login"), {"email": "m@example.org", "password": "kodikos-12345"})
        self.assertRedirects(r, reverse("totp"), fetch_redirect_response=False)
