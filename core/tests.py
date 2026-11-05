from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse

from . import exposure
from .models import Comment, Decision, Impression, MaxWords, Party, Proposal, Question, RateLimitHit, Topic


def party(name, kind=Party.KIND_PARTY, tier=Party.TIER_FULL, **kw):
    return Party.objects.create(
        name=name, kind=kind, tier=tier, responsible_persons="Α Β", is_published=kw.pop("is_published", True), **kw
    )


class RotationTests(TestCase):
    def test_equal_exposure_over_many_rounds(self):
        for i in range(8):
            party(f"P{i}")
        for _ in range(40):
            exposure.pick(Party.KIND_PARTY, Party.TIER_FULL, n=6)
        counts = [p.impressions.count() for p in Party.objects.all()]
        self.assertLessEqual(max(counts) - min(counts), 1)
        self.assertEqual(sum(counts), 240)

    def test_excluded_parties_never_shown(self):
        party("ok")
        party("hidden", is_published=False)
        party("grad", graduated=True)
        party("group", kind=Party.KIND_GROUP)
        names = {p.name for p in exposure.pick(Party.KIND_PARTY, Party.TIER_FULL, n=10)}
        self.assertEqual(names, {"ok"})

    def test_groups_have_separate_rotation(self):
        party("g1", kind=Party.KIND_GROUP, tier=Party.TIER_PROGRESS)
        party("p1")
        names = {p.name for p in exposure.pick(Party.KIND_GROUP, None, n=10)}
        self.assertEqual(names, {"g1"})

    def test_fewest_impressions_first(self):
        a, b, c = party("a"), party("b"), party("c")
        Impression.objects.bulk_create([Impression(party=a)] * 3 + [Impression(party=b)] * 1)
        chosen = exposure.pick(Party.KIND_PARTY, Party.TIER_FULL, n=1, record=False)
        self.assertEqual(chosen[0], c)


class ModelTests(TestCase):
    def test_word_limit(self):
        MaxWords(3)("ένα δύο τρία")
        with self.assertRaises(ValidationError):
            MaxWords(3)("ένα δύο τρία τέσσερα")

    def test_person_count_validation(self):
        p = Party(name="X", responsible_persons="")
        with self.assertRaises(ValidationError):
            p.full_clean()
        p = Party(name="Y", responsible_persons="1\n2\n3\n4")
        with self.assertRaises(ValidationError):
            p.full_clean()

    def test_unique_greek_slug(self):
        a = party("Κόμμα Ένα")
        b = Party.objects.create(name="Κόμμα  Ένα ", responsible_persons="Α")
        self.assertNotEqual(a.slug, b.slug)


class SiteTests(TestCase):
    def setUp(self):
        from . import features
        from .models import FeatureFlag
        features.ensure_flags()
        FeatureFlag.objects.filter(key="citizen_accounts").update(state="off")  # ανώνυμη ροή (παλιά λειτουργία)
        self.topic = Topic.objects.create(name="Θέμα δοκιμής", slug="thema-dokimis")
        self.p = party("Κόμμα Δοκιμής")
        self.prop = Proposal.objects.create(
            party=self.p, topic=self.topic, title="Τίτλος",
            problem="π", action="α", legal="ν", cost="κ", tradeoffs="τ", timeline="χ", metric="μ",
        )

    def captcha(self, value=7):
        s = self.client.session
        s["captcha_answer"] = value
        s.save()

    def post_comment(self, body="Ένα επιχείρημα.", kind="for", captcha="7", website=""):
        self.captcha(7)
        return self.client.post(
            reverse("proposal", args=[self.prop.pk]),
            {"kind": kind, "pseudonym": "Χρήστης", "body": body, "captcha": captcha, "website": website},
        )

    def test_pages_render(self):
        for name, args in [
            ("home", []), ("catalog", []), ("topics", []), ("rules", []), ("transparency", []),
            ("party", [self.p.slug]), ("topic", [self.topic.slug]), ("proposal", [self.prop.pk]),
        ]:
            self.assertEqual(self.client.get(reverse(name, args=args)).status_code, 200, name)

    def test_home_records_impressions_but_head_does_not(self):
        self.client.head(reverse("catalog"))
        self.assertEqual(Impression.objects.count(), 0)
        self.client.get(reverse("catalog"))
        self.assertEqual(Impression.objects.count(), 1)

    def test_comment_flow_and_delete_code(self):
        r = self.post_comment()
        self.assertEqual(r.status_code, 302)
        c = Comment.objects.get()
        msg = [m.message for m in self.client.get(r.url).context["messages"]][0]
        code = msg.split("Κωδικός διαγραφής: ")[1].split(".")[0]
        bad = self.client.post(reverse("delete_comment", args=[c.pk]), {"code": "λάθος"})
        c.refresh_from_db()
        self.assertFalse(c.removed)
        self.client.post(reverse("delete_comment", args=[c.pk]), {"code": code})
        c.refresh_from_db()
        self.assertTrue(c.removed and c.removed_by_author and c.body == "")

    def test_wrong_captcha_rejected(self):
        self.post_comment(captcha="99")
        self.assertEqual(Comment.objects.count(), 0)

    def test_honeypot_rejected(self):
        self.post_comment(website="spam")
        self.assertEqual(Comment.objects.count(), 0)

    def test_links_rejected(self):
        self.post_comment(body="δείτε https://example.com")
        self.assertEqual(Comment.objects.count(), 0)

    def test_duplicate_rejected(self):
        self.post_comment(body="Ίδιο κείμενο")
        self.post_comment(body="Ίδιο κείμενο")
        self.assertEqual(Comment.objects.count(), 1)

    @override_settings(FD_RATE_HOUR=2)
    def test_rate_limit(self):
        for i in range(4):
            self.post_comment(body=f"σχόλιο {i}")
        self.assertEqual(Comment.objects.count(), 2)
        self.assertEqual(RateLimitHit.objects.count(), 2)
        # η αρχική διεύθυνση δεν αποθηκεύεται, μόνο HMAC
        self.assertNotIn("127.0.0.1", RateLimitHit.objects.first().ip_hash)

    def test_question_flow(self):
        self.captcha()
        r = self.client.post(
            reverse("topic", args=[self.topic.slug]),
            {"pseudonym": "Π", "body": "Ποιο είναι το κόστος;", "captcha": "7", "website": ""},
        )
        self.assertEqual(r.status_code, 302)
        self.assertEqual(Question.objects.count(), 1)

    def test_catalog_filters(self):
        g = party("Ομάδα Δοκιμής", kind=Party.KIND_GROUP, tier=Party.TIER_PROGRESS)
        both = self.client.get(reverse("catalog"), {"all": "1"}).context["parties"]
        self.assertEqual({x.pk for x in both}, {self.p.pk, g.pk})
        groups = self.client.get(reverse("catalog"), {"kind": "group"}).context["parties"]
        self.assertEqual([x.pk for x in groups], [g.pk])
        by_topic = self.client.get(reverse("catalog"), {"topic": self.topic.slug}).context["parties"]
        self.assertEqual([x.pk for x in by_topic], [self.p.pk])

    def test_topic_page_lists_parties_without_position(self):
        other = party("Χωρίς Θέση")
        missing = self.client.get(reverse("topic", args=[self.topic.slug])).context["missing"]
        self.assertEqual([m.pk for m in missing], [other.pk])

    def test_unpublished_party_hidden(self):
        hidden = party("Κρυφό", is_published=False)
        self.assertEqual(self.client.get(reverse("party", args=[hidden.slug])).status_code, 404)

    def test_purge_old(self):
        from datetime import timedelta
        from django.core.management import call_command
        from django.utils import timezone
        RateLimitHit.objects.create(ip_hash="x", created_at=timezone.now() - timedelta(hours=30))
        RateLimitHit.objects.create(ip_hash="y")
        call_command("purge_old")
        self.assertEqual(list(RateLimitHit.objects.values_list("ip_hash", flat=True)), ["y"])

    def test_seed_demo_idempotent(self):
        from django.core.management import call_command
        call_command("seed_demo")
        n = Party.objects.count()
        call_command("seed_demo")
        self.assertEqual(Party.objects.count(), n)
        self.assertEqual(Topic.objects.count(), 11)  # 10 + το θέμα δοκιμής
