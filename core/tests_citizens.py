"""Δοκιμές: λογαριασμοί πολιτών/οργανισμών, επιβεβαίωση email, σχόλια και προτάσεις πολιτών."""
import re

from django.core import mail
from django.test import TestCase
from django.urls import reverse

from .models import CitizenProfile, CitizenProposal, Comment, Decision, Party, Proposal, Question, Topic

PW = "kodikos-politi-77x"
FIELDS = dict(title="Τίτλος", problem="π", action="α", legal="ν", cost="κ", tradeoffs="τ", timeline="χ", metric="μ", source="https://example.org/pigi")


class CitizenBase(TestCase):
    def setUp(self):
        from . import features
        features.ensure_flags()
        self.topic = Topic.objects.create(name="Θέμα", slug="th")
        self.p = Party.objects.create(name="Κόμμα", responsible_persons="x", is_published=True)
        self.prop = Proposal.objects.create(party=self.p, topic=self.topic, title="Τ", problem="π", action="α", legal="ν",
                                            cost="κ", tradeoffs="τ", timeline="χ", metric="μ", source="https://example.org")

    def register(self, email="a@example.org", name="Ψευδώνυμο", kind="person", **extra):
        self.client.get(reverse("citizen_register"))
        data = dict(email=email, kind=kind, display_name=name, org_type="", contact_person="", password1=PW, password2=PW,
                    consent="on", captcha=str(self.client.session["captcha_answer"]), website="")
        data.update(extra)
        return self.client.post(reverse("citizen_register"), data)

    def verify_from_mail(self):
        link = re.search(r"http://testserver(/[^\s]+)", mail.outbox[-1].body).group(1)
        return self.client.get(link)

    def make_user(self, email="a@example.org", name="Ψευδώνυμο", verified=True, **kw):
        self.register(email, name, **kw)
        if verified:
            self.verify_from_mail()
        self.client.post(reverse("login"), {"email": email, "password": PW})


class AccountTests(CitizenBase):
    def test_register_sends_mail_and_verification(self):
        r = self.register()
        self.assertRedirects(r, reverse("login"), fetch_redirect_response=False)
        prof = CitizenProfile.objects.get()
        self.assertFalse(prof.verified)
        self.assertEqual(len(mail.outbox), 1)
        self.verify_from_mail()
        prof.refresh_from_db()
        self.assertTrue(prof.verified)

    def test_bad_token_and_duplicate_email_not_revealed(self):
        self.assertRedirects(self.client.get(reverse("citizen_verify", args=["λάθος"])), reverse("login"), fetch_redirect_response=False)
        self.register()
        r = self.register(name="Άλλο")
        self.assertRedirects(r, reverse("login"), fetch_redirect_response=False)
        self.assertEqual(CitizenProfile.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_organization_needs_type_and_contact(self):
        self.register(kind="organization")
        self.assertEqual(CitizenProfile.objects.count(), 0)
        self.register(kind="organization", name="Κανάλι", org_type="youtube", contact_person="Γιάννης Π.")
        prof = CitizenProfile.objects.get()
        self.assertEqual((prof.kind, prof.org_type, prof.public_label), ("organization", "youtube", "Κανάλι YouTube"))

    def test_weak_password_name_taken_honeypot_captcha(self):
        self.register(password1="123", password2="123")
        self.register(website="bot")
        self.register(captcha="0")
        self.assertEqual(CitizenProfile.objects.count(), 0)
        self.register(name="Κόμμα")  # όνομα υπάρχοντος κόμματος
        self.assertEqual(CitizenProfile.objects.count(), 0)

    def test_party_member_cannot_use_citizen_login(self):
        from django.contrib.auth import get_user_model
        get_user_model().objects.create_user("p@example.org", "p@example.org", PW)
        r = self.client.post(reverse("login"), {"email": "p@example.org", "password": PW})
        self.assertEqual(r.status_code, 200)

    def test_delete_account_anonymizes_comments(self):
        self.make_user()
        self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "Ένα επιχείρημα."})
        self.assertEqual(Comment.objects.get().author.display_name, "Ψευδώνυμο")
        self.client.post(reverse("citizen_delete"), {"password": "λάθος"})
        self.assertEqual(CitizenProfile.objects.count(), 1)
        self.client.post(reverse("citizen_delete"), {"password": PW})
        self.assertEqual(CitizenProfile.objects.count(), 0)
        c = Comment.objects.get()
        self.assertIsNone(c.author)
        self.assertEqual(c.pseudonym, "Διαγραμμένος λογαριασμός")

    def test_password_reset_page(self):
        self.assertEqual(self.client.get(reverse("citizen_pw_reset")).status_code, 200)
        self.assertEqual(self.client.get(reverse("privacy")).status_code, 200)


class CommentingTests(CitizenBase):
    def test_anonymous_cannot_post_in_account_mode(self):
        r = self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "Ένα επιχείρημα."})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertContains(self.client.get(reverse("proposal", args=[self.prop.pk])), "Δημιουργία λογαριασμού")

    def test_unverified_cannot_post(self):
        self.make_user(verified=False)
        self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "Ένα επιχείρημα."})
        self.assertEqual(Comment.objects.count(), 0)

    def test_verified_comment_question_and_author_delete(self):
        self.make_user()
        self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "Ένα επιχείρημα."})
        self.client.post(reverse("topic", args=[self.topic.slug]), {"body": "Ποιο το κόστος;"})
        c, q = Comment.objects.get(), Question.objects.get()
        self.assertEqual((c.pseudonym, q.pseudonym), ("Ψευδώνυμο", "Ψευδώνυμο"))
        self.assertContains(self.client.get(reverse("proposal", args=[self.prop.pk])), "επαληθευμένο email")
        self.client.post(reverse("delete_comment", args=[c.pk]), {})
        c.refresh_from_db()
        self.assertTrue(c.removed)

    def test_other_account_cannot_delete(self):
        self.make_user()
        self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "Ένα επιχείρημα."})
        c = Comment.objects.get()
        self.client.post(reverse("logout"))
        self.make_user("b@example.org", "Άλλος")
        self.client.post(reverse("delete_comment", args=[c.pk]), {})
        c.refresh_from_db()
        self.assertFalse(c.removed)

    def test_links_still_blocked_for_accounts(self):
        self.make_user()
        self.client.post(reverse("proposal", args=[self.prop.pk]), {"kind": "for", "body": "δείτε https://example.com"})
        self.assertEqual(Comment.objects.count(), 0)


class CitizenProposalTests(CitizenBase):
    def url(self):
        return reverse("citizen_proposal_new", args=[self.topic.slug])

    def test_requires_verified_account(self):
        self.assertEqual(self.client.post(self.url(), FIELDS).status_code, 302)
        self.make_user(verified=False)
        self.client.post(self.url(), FIELDS)
        self.assertEqual(CitizenProposal.objects.count(), 0)

    def test_create_one_per_topic_and_listing(self):
        self.make_user(kind="organization", org_type="show", contact_person="Μαρία")
        r = self.client.post(self.url(), FIELDS)
        prop = CitizenProposal.objects.get()
        self.assertRedirects(r, reverse("citizen_proposal", args=[prop.pk]), fetch_redirect_response=False)
        self.client.post(self.url(), dict(FIELDS, title="Δεύτερη"))
        self.assertEqual(CitizenProposal.objects.count(), 1)
        page = self.client.get(reverse("topic", args=[self.topic.slug])).content.decode()
        self.assertIn("Εκπομπή", page)
        self.assertIn("Προτάσεις πολιτών και οργανισμών", page)
        self.assertNotIn("Μαρία", page)  # το πρόσωπο επικοινωνίας δεν δημοσιεύεται

    def test_source_required_and_links_blocked(self):
        self.make_user()
        self.client.post(self.url(), dict(FIELDS, source=""))
        self.client.post(self.url(), dict(FIELDS, problem="δες https://x.gr"))
        self.assertEqual(CitizenProposal.objects.count(), 0)

    def test_report_author_delete_and_admin_removal_logged(self):
        self.make_user()
        self.client.post(self.url(), FIELDS)
        prop = CitizenProposal.objects.get()
        self.client.post(reverse("citizen_proposal_report", args=[prop.pk]))
        prop.refresh_from_db()
        self.assertEqual(prop.report_count, 1)
        from django.contrib.auth import get_user_model
        admin = get_user_model().objects.create_superuser("root", "r@example.org", "pw-root-123")
        self.client.logout()
        self.client.force_login(admin)
        self.client.post(reverse("admin:core_citizenproposal_change", args=[prop.pk]),
                         dict(author=prop.author_id, topic=self.topic.pk, title=prop.title, problem="π", action="α", legal="ν", cost="κ",
                              tradeoffs="τ", timeline="χ", metric="μ", source=prop.source, created_at_0="2026-01-01", created_at_1="10:00:00",
                              removed="on", moderation_note="Παράβαση όρων"))
        self.assertTrue(Decision.objects.filter(reason="Παράβαση όρων").exists())
        self.assertEqual(self.client.get(reverse("citizen_proposal", args=[prop.pk])).status_code, 404)

    def test_author_delete_frees_slot(self):
        self.make_user()
        self.client.post(self.url(), FIELDS)
        prop = CitizenProposal.objects.get()
        self.client.post(reverse("citizen_proposal_delete", args=[prop.pk]))
        self.assertEqual(CitizenProposal.objects.count(), 0)
        self.client.post(self.url(), FIELDS)
        self.assertEqual(CitizenProposal.objects.count(), 1)

    def test_flag_off_hides(self):
        from .models import FeatureFlag
        FeatureFlag.objects.filter(key="citizen_proposals").update(state="off")
        self.make_user()
        self.assertEqual(self.client.get(self.url()).status_code, 404)
