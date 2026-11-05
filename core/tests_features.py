"""Δοκιμές για τα νέα χαρακτηριστικά: στατιστική αρχική, κατάλογος, αίτηση, CSP, ιστορικό ανά πεδίο."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import ChangeLogEntry, Impression, Party, PartyApplication, PartyMember, Proposal, Topic
from .tests_accounts import FIELDS, PASSWORD, make_member


class HomeCatalogTests(TestCase):
    def setUp(self):
        self.p = Party.objects.create(name="Ζήνων", responsible_persons="x", is_published=True, tier=Party.TIER_FULL)
        self.g = Party.objects.create(name="Ξενοφών", responsible_persons="x", is_published=True, kind=Party.KIND_GROUP)

    def test_home_shows_statistics_but_no_party(self):
        r = self.client.get(reverse("home"))
        self.assertEqual(r.status_code, 200)
        self.assertNotContains(r, "Ζήνων")
        self.assertNotContains(r, "Ξενοφών")
        self.assertContains(r, 'stroke-dasharray="219.9 219.9"')  # τελεία, όχι κόμμα, στο SVG
        self.assertEqual(r.context["n_parties"], 1)
        self.assertEqual(r.context["n_groups"], 1)
        self.assertEqual(Impression.objects.count(), 0)

    def test_catalog_rotation_vs_filters(self):
        r = self.client.get(reverse("catalog"))
        self.assertFalse(r.context["filtered"])
        self.assertEqual(Impression.objects.count(), 2)
        before = Impression.objects.count()
        r = self.client.get(reverse("catalog"), {"q": "Ζήν"})
        self.assertTrue(r.context["filtered"])
        self.assertEqual([x.pk for x in r.context["parties"]], [self.p.pk])
        self.client.get(reverse("catalog"), {"all": "1"})
        self.assertEqual(Impression.objects.count(), before)  # τα φίλτρα δεν καταγράφουν εμφανίσεις

    def test_health_and_security_headers(self):
        r = self.client.get(reverse("health"))
        self.assertEqual(r.json()["application"], "freedom-for-democracy")
        csp = self.client.get(reverse("home"))["Content-Security-Policy"]
        self.assertIn("style-src 'self'", csp)
        self.assertEqual(self.client.get(reverse("home"))["Referrer-Policy"], "same-origin")

    def test_no_inline_styles_or_external_fonts(self):
        for name in ["home", "catalog", "rules", "transparency", "apply", "topics", "login"]:
            html = self.client.get(reverse(name)).content.decode()
            self.assertNotIn(" style=", html, name)
            self.assertNotIn("googleapis", html, name)


class ApplicationTests(TestCase):
    def post(self, **extra):
        self.client.get(reverse("apply"))
        answer = str(self.client.session["captcha_answer"])
        data = dict(name="Νέο Κόμμα", kind="party", responsible_persons="Α Β", contact_email="n@example.org",
                    elections_statement="Δεν εκπροσωπηθήκαμε.", website="", captcha=answer, website_url="")
        data.update(extra)
        return self.client.post(reverse("apply"), data)

    def test_submit_and_admin_approve(self):
        r = self.post()
        self.assertEqual(r.status_code, 302)
        app = PartyApplication.objects.get()
        self.assertEqual(app.state, PartyApplication.PENDING)
        self.assertEqual(Party.objects.count(), 0)  # τίποτα δημόσιο πριν τον έλεγχο
        User = get_user_model()
        admin = User.objects.create_superuser("root", "root@example.org", "pw-root-123")
        self.client.force_login(admin)
        r = self.client.post(reverse("admin:core_partyapplication_changelist"),
                             {"action": "approve", "_selected_action": [app.pk]}, follow=True)
        app.refresh_from_db()
        self.assertEqual(app.state, PartyApplication.APPROVED)
        self.assertFalse(app.party.is_published)
        self.assertTrue(PartyMember.objects.filter(party=app.party, user__username="n@example.org").exists())

    def test_honeypot_wrong_captcha_and_duplicate_name(self):
        self.post(website_url="spam")
        self.assertEqual(PartyApplication.objects.count(), 0)
        self.post(captcha="0")
        self.assertEqual(PartyApplication.objects.count(), 0)
        Party.objects.create(name="Νέο Κόμμα", responsible_persons="x")
        self.post()
        self.assertEqual(PartyApplication.objects.count(), 0)

    def test_rate_limit(self):
        for i in range(3):
            self.post(name=f"Κόμμα {i}", contact_email=f"k{i}@example.org")
        self.post(name="Τέταρτο", contact_email="k4@example.org")
        self.assertEqual(PartyApplication.objects.count(), 3)

    def test_requires_one_to_three_persons(self):
        self.post(responsible_persons="1\n2\n3\n4")
        self.assertEqual(PartyApplication.objects.count(), 0)


class HistoryAndSourceTests(TestCase):
    def setUp(self):
        self.topic = Topic.objects.create(name="Θέμα", slug="th")
        self.a = Party.objects.create(name="Α", responsible_persons="x", is_published=True)
        make_member("a@example.org", self.a)

    def login(self):
        from . import totp
        from .models import TotpDevice
        self.client.post(reverse("login"), {"email": "a@example.org", "password": PASSWORD})
        self.client.get(reverse("totp"))
        dev = TotpDevice.objects.get(user__username="a@example.org")
        self.client.post(reverse("totp"), {"code": totp.code_now(dev.secret)})

    def test_source_required_and_shown(self):
        self.login()
        data = dict(topic=self.topic.pk, title="Τ", is_published="on", **FIELDS)
        self.assertEqual(self.client.post(reverse("proposal_new"), data).status_code, 200)  # λείπει πηγή
        data["source"] = "https://example.org/pigi"
        self.assertEqual(self.client.post(reverse("proposal_new"), data).status_code, 302)
        prop = Proposal.objects.get()
        self.assertContains(self.client.get(reverse("proposal", args=[prop.pk])), "https://example.org/pigi")

    def test_field_level_history_and_drafts_not_logged(self):
        self.login()
        data = dict(topic=self.topic.pk, title="Τ", source="https://example.org/a", **FIELDS)  # πρόχειρη
        self.client.post(reverse("proposal_new"), data)
        self.assertEqual(ChangeLogEntry.objects.count(), 0)
        data.update(is_published="on")
        prop = Proposal.objects.get()
        self.client.post(reverse("proposal_edit", args=[prop.pk]), data)
        self.assertIn("Δημοσιεύτηκε", ChangeLogEntry.objects.get().summary)
        data["problem"] = "Νέο κείμενο προβλήματος"
        self.client.post(reverse("proposal_edit", args=[prop.pk]), data)
        entry = ChangeLogEntry.objects.first()
        self.assertEqual(entry.details[0]["field"], "problem")
        self.assertEqual(entry.details[0]["after"], "Νέο κείμενο προβλήματος")
        self.assertTrue(entry.details[0]["before"])
        self.assertContains(self.client.get(reverse("party", args=[self.a.slug])), "Νέο κείμενο προβλήματος")


class FeatureFlagTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser("root", "root@example.org", "pw-root-123")

    def test_defaults_and_gating(self):
        from . import features
        self.assertEqual(self.client.get(reverse("apply")).status_code, 200)  # applications: on
        self.assertFalse(features.enabled(self.client.get("/").wsgi_request, "notifications"))
        self.assertTrue(features.enabled(self.client.get("/").wsgi_request, "comparison"))
        self.assertFalse(features.enabled(self.client.get("/").wsgi_request, "άγνωστη"))

    def test_off_hides_apply_and_test_is_admin_only(self):
        from .models import FeatureFlag
        from . import features
        features.ensure_flags()
        FeatureFlag.objects.filter(key="applications").update(state="off")
        self.assertEqual(self.client.get(reverse("apply")).status_code, 404)
        self.assertNotContains(self.client.get("/"), "Αίτηση συμμετοχής")
        FeatureFlag.objects.filter(key="applications").update(state="test")
        self.assertEqual(self.client.get(reverse("apply")).status_code, 404)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(reverse("apply")).status_code, 200)

    def test_admin_change_is_audited_and_public(self):
        from .models import FeatureChange, FeatureFlag
        from . import features
        features.ensure_flags()
        self.client.force_login(self.admin)
        flag = FeatureFlag.objects.get(key="notifications")
        r = self.client.post(reverse("admin:core_featureflag_change", args=[flag.pk]), {"state": "test", "changes-TOTAL_FORMS": 0, "changes-INITIAL_FORMS": 0})
        self.assertEqual(r.status_code, 302)
        flag.refresh_from_db()
        self.assertEqual((flag.state, flag.version), ("test", 2))
        ch = FeatureChange.objects.get()
        self.assertEqual((ch.old_state, ch.new_state, ch.by), ("off", "test", "root"))
        self.client.logout()
        page = self.client.get(reverse("transparency")).content.decode()
        self.assertIn("Ειδοποιήσεις", page)
        self.assertIn("off → test", page)


class CompareTests(TestCase):
    def setUp(self):
        from .models import FeatureFlag
        from . import features
        features.ensure_flags()
        FeatureFlag.objects.filter(key="comparison").update(state="on")
        self.t = Topic.objects.create(name="Θέμα", slug="th")
        self.a = Party.objects.create(name="Αλφα", responsible_persons="x", is_published=True)
        self.b = Party.objects.create(name="Βητα", responsible_persons="x", is_published=True)
        self.c = Party.objects.create(name="Γαμμα", responsible_persons="x", is_published=True)
        Proposal.objects.create(party=self.a, topic=self.t, title="ΠροτΑ", source="https://example.org/a",
                                is_published=True, **{k: "κείμενο Α" for k in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]})

    def test_compare_two_with_missing_position(self):
        r = self.client.get(reverse("compare"), {"topic": "th", "p": [self.a.slug, self.b.slug]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.context["columns"]), 2)
        self.assertContains(r, "κείμενο Α")
        self.assertContains(r, "Δεν έχει δηλωθεί θέση")

    def test_topic_page_has_pickers_and_all(self):
        Proposal.objects.create(party=self.b, topic=self.t, title="ΠροτΒ", source="https://example.org/b",
                                is_published=True, **{k: "κείμενο Β" for k in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]})
        r = self.client.get(reverse("topic", args=["th"]))
        self.assertContains(r, 'name="p" value="%s" form="cmpform"' % self.a.slug)
        r = self.client.get(reverse("compare"), {"topic": "th", "all": "1"})
        self.assertEqual(len(r.context["columns"]), 2)
        self.assertContains(r, "κείμενο Β")

    def test_many_columns_allowed(self):
        slugs = [self.a.slug, self.b.slug, self.c.slug]
        r = self.client.get(reverse("compare"), {"topic": "th", "p": slugs})
        self.assertEqual(len(r.context["columns"]), 3)

    def test_needs_two_and_max_three_and_flag(self):
        r = self.client.get(reverse("compare"), {"topic": "th", "p": [self.a.slug]})
        self.assertContains(r, "τουλάχιστον δύο")
        r = self.client.get(reverse("compare"), {"topic": "th", "p": [self.a.slug, self.b.slug, self.c.slug, "x"]})
        self.assertEqual(len(r.context["columns"]), 3)
        from .models import FeatureFlag
        FeatureFlag.objects.filter(key="comparison").update(state="off")
        self.assertEqual(self.client.get(reverse("compare")).status_code, 404)


class PartyImageTests(TestCase):
    def setUp(self):
        import shutil
        import tempfile

        from django.test import override_settings

        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.addCleanup(shutil.rmtree, self.media, True)
        self.a = Party.objects.create(name="Α", responsible_persons="x", is_published=True, tier=Party.TIER_FULL)
        make_member("a@example.org", self.a)

    def login(self):
        from . import totp
        from .models import TotpDevice
        self.client.post(reverse("login"), {"email": "a@example.org", "password": PASSWORD})
        self.client.get(reverse("totp"))
        self.client.post(reverse("totp"), {"code": totp.code_now(TotpDevice.objects.get().secret)})

    def png(self, size=(40, 30), fmt="PNG", exif=False):
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        buf = io.BytesIO()
        img = Image.new("RGB", size, "red")
        kw = {}
        if exif:
            ex = Image.Exif()
            ex[0x010F] = "SecretCamera"
            kw["exif"] = ex
        img.save(buf, format=fmt, **kw)
        return SimpleUploadedFile("φωτο." + fmt.lower(), buf.getvalue(), content_type="image/" + fmt.lower())

    def test_placeholder_when_empty_then_image(self):
        page = self.client.get(reverse("catalog")).content.decode()
        self.assertIn("Φωτογραφία ομάδας", page)
        self.login()
        r = self.client.post(reverse("profile_edit"), {"slogan": "s", "image": self.png()})
        self.assertEqual(r.status_code, 302)
        self.a.refresh_from_db()
        self.assertTrue(self.a.image.name.startswith("party_images/"))
        self.assertNotIn("φωτο", self.a.image.name)  # το όνομα αρχείου του χρήστη δεν κρατιέται
        page = self.client.get(reverse("catalog")).content.decode()
        self.assertIn(self.a.image.url, page)
        self.assertNotIn("Φωτογραφία ομάδας", page)

    def test_rejects_non_image_and_too_large_and_strips_exif(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.login()
        bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
        self.assertEqual(self.client.post(reverse("profile_edit"), {"slogan": "s", "image": bad}).status_code, 200)
        big = SimpleUploadedFile("b.png", b"0" * (2 * 1024 * 1024 + 1), content_type="image/png")
        self.assertEqual(self.client.post(reverse("profile_edit"), {"slogan": "s", "image": big}).status_code, 200)
        self.assertEqual(self.client.post(reverse("profile_edit"), {"slogan": "s", "image": self.png(fmt="JPEG", exif=True)}).status_code, 302)
        from PIL import Image
        self.a.refresh_from_db()
        with Image.open(self.a.image.path) as im:
            self.assertNotIn(0x010F, im.getexif())


class SectionPagesTests(TestCase):
    def test_topics_and_transparency_pages(self):
        t = Topic.objects.create(name="Θέμα", slug="th")
        for name in ["topics", "transparency"]:
            html = self.client.get(reverse(name)).content.decode()
            self.assertIn("eyebrow", html)
            self.assertNotIn(" style=", html)
        self.assertContains(self.client.get(reverse("topic", args=[t.slug])), "Όλα τα θέματα")


class PeopleSocialTests(TestCase):
    def setUp(self):
        self.a = Party.objects.create(
            name="Α", responsible_persons="Μαρία Παπά\nΝίκος Δ", founders="Ελένη Κ", is_published=True,
            tier=Party.TIER_FULL, facebook="https://facebook.com/alpha")
        make_member("a@example.org", self.a)

    def login(self):
        from . import totp
        from .models import TotpDevice
        self.client.post(reverse("login"), {"email": "a@example.org", "password": PASSWORD})
        self.client.get(reverse("totp"))
        self.client.post(reverse("totp"), {"code": totp.code_now(TotpDevice.objects.get().secret)})

    def blank(self):
        d = {}
        for i in range(3):
            d.update({f"occupation{i}": "", f"education{i}": "", f"experience{i}": "", f"office{i}": "none",
                      f"office_details{i}": "", f"motivation{i}": "", f"url{i}": ""})
        return d

    def test_office_requires_details(self):
        self.login()
        data = self.blank()
        data["office0"] = "held"
        self.assertEqual(self.client.post(reverse("people_edit"), data).status_code, 200)
        data["office_details0"] = "Δημοτικός σύμβουλος 2014-2019"
        self.assertEqual(self.client.post(reverse("people_edit"), data).status_code, 302)
        r = self.client.get(reverse("party", args=[self.a.slug]))
        self.assertContains(r, "Δημοτικός σύμβουλος 2014-2019")

    def test_party_page_has_popovers_and_icons(self):
        r = self.client.get(reverse("party", args=[self.a.slug]))
        self.assertContains(r, 'popovertarget="', count=6)  # 3 κουμπιά + 3 «κλείσιμο»
        self.assertContains(r, 'aria-label="Facebook"')
        self.assertContains(r, "Δεν έχει προστεθεί βιογραφικό")
        self.assertNotContains(r, 'style="')

    def test_bio_save_logged_and_shown(self):
        self.login()
        self.assertEqual(self.client.get(reverse("people_edit")).status_code, 200)
        data = self.blank()
        data.update({"occupation0": "Δικηγόρος", "url0": "https://x.com/maria"})
        r = self.client.post(reverse("people_edit"), data)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(self.a.people.get().name, "Μαρία Παπά")
        self.assertTrue(ChangeLogEntry.objects.filter(party=self.a, summary__contains="Μαρία").exists())
        r = self.client.get(reverse("party", args=[self.a.slug]))
        self.assertContains(r, "Δικηγόρος")
        self.assertContains(r, "https://x.com/maria")

    def test_bio_rejects_http_link(self):
        self.login()
        data = self.blank()
        data["url0"] = "http://x.com/m"
        r = self.client.post(reverse("people_edit"), data)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.a.people.count(), 0)

    def test_social_host_validation(self):
        self.login()
        base = {"slogan": "", "founders": "Ελένη Κ", "funding": "", "website": ""}
        r = self.client.post(reverse("profile_edit"), {**base, "instagram": "https://evil.example/x"})
        self.assertEqual(r.status_code, 200)
        r = self.client.post(reverse("profile_edit"), {**base, "instagram": "https://instagram.com/alpha"})
        self.assertEqual(r.status_code, 302)
        self.a.refresh_from_db()
        self.assertEqual(self.a.instagram, "https://instagram.com/alpha")

    def test_manage_and_home(self):
        self.login()
        self.assertContains(self.client.get(reverse("manage")), reverse("people_edit"))
        self.assertContains(self.client.get(reverse("home")), "Συγκρίνεις ουσία")


class VideosTests(TestCase):
    def setUp(self):
        self.a = Party.objects.create(name="Β", responsible_persons="x", is_published=True, tier=Party.TIER_FULL)
        make_member("b@example.org", self.a)
        from . import totp
        from .models import TotpDevice
        self.client.post(reverse("login"), {"email": "b@example.org", "password": PASSWORD})
        self.client.get(reverse("totp"))
        self.client.post(reverse("totp"), {"code": totp.code_now(TotpDevice.objects.get().secret)})

    def blank(self):
        return {f"{k}{i}": "" for i in range(4) for k in ("url", "title")}

    def test_save_and_show(self):
        d = self.blank()
        d.update({"url0": "https://www.youtube.com/watch?v=abc", "title0": "Ομιλία ιδρυτή"})
        self.assertEqual(self.client.post(reverse("videos_edit"), d).status_code, 302)
        r = self.client.get(reverse("party", args=[self.a.slug]))
        self.assertContains(r, "Ομιλία ιδρυτή")
        self.assertContains(r, "https://www.youtube.com/watch?v=abc")
        self.assertTrue(ChangeLogEntry.objects.filter(party=self.a, summary__contains="βίντεο").exists())

    def test_rejects_other_hosts_and_missing_title(self):
        d = self.blank()
        d.update({"url0": "https://evil.example/v", "title0": "x"})
        self.assertEqual(self.client.post(reverse("videos_edit"), d).status_code, 200)
        d.update({"url0": "https://youtu.be/abc", "title0": ""})
        self.assertEqual(self.client.post(reverse("videos_edit"), d).status_code, 200)
        self.assertEqual(self.a.videos.count(), 0)

    def test_home_pitch(self):
        self.assertContains(self.client.get(reverse("home")), "Οι μεγάλες φωνές έχουν ήδη βήμα")


class CompareCitizensTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from .models import CitizenProfile, CitizenProposal, Topic

        self.t = Topic.objects.create(name="Θέμα Χ", slug="thx")
        self.a = Party.objects.create(name="ΚΑ", responsible_persons="x", is_published=True)
        text = {k: f"κείμενο {k}" for k in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}
        Proposal.objects.create(party=self.a, topic=self.t, title="ΠροτΚΑ", source="https://example.org", is_published=True, **text)
        self.cps = []
        for i, name in enumerate(["Πολίτης Ένα", "Πολίτης Δύο"]):
            u = get_user_model().objects.create_user(f"c{i}@example.org", f"c{i}@example.org", "x-pass-12345")
            prof = CitizenProfile.objects.create(user=u, display_name=name, verified_at=timezone.now())
            self.cps.append(CitizenProposal.objects.create(author=prof, topic=self.t, title=f"Πρόταση {name}", source="https://example.org", **text))

    def test_all_includes_citizens(self):
        r = self.client.get(reverse("compare"), {"topic": "thx", "all": "1"})
        self.assertEqual(len(r.context["columns"]), 3)
        self.assertContains(r, "Πολίτης Ένα")
        self.assertContains(r, "Πολίτης")

    def test_mixed_selection(self):
        r = self.client.get(reverse("compare"), {"topic": "thx", "p": [self.a.slug], "c": [str(self.cps[0].pk)]})
        self.assertEqual(len(r.context["columns"]), 2)

    def test_two_citizens_only(self):
        r = self.client.get(reverse("compare"), {"topic": "thx", "c": [str(c.pk) for c in self.cps]})
        self.assertEqual(len(r.context["columns"]), 2)

    def test_single_selection_rejected(self):
        r = self.client.get(reverse("compare"), {"topic": "thx", "c": [str(self.cps[0].pk)]})
        self.assertEqual(r.context["columns"], [])
        self.assertContains(r, "τουλάχιστον δύο")

    def test_removed_proposal_excluded_and_topic_checkboxes(self):
        self.cps[1].removed = True
        self.cps[1].save()
        r = self.client.get(reverse("compare"), {"topic": "thx", "all": "1"})
        self.assertEqual(len(r.context["columns"]), 2)
        page = self.client.get(reverse("topic", args=["thx"]))
        self.assertContains(page, 'name="c" value="%d" form="cmpform"' % self.cps[0].pk)

    def test_citizen_flag_off_hides_citizens(self):
        from .models import FeatureFlag
        self.client.get(reverse("home"))  # δημιουργεί τις εγγραφές λειτουργιών
        FeatureFlag.objects.filter(key="citizen_proposals").update(state="off")
        r = self.client.get(reverse("compare"), {"topic": "thx", "all": "1"})
        self.assertEqual(len(r.context["columns"]), 0)
        self.assertNotContains(r, "Πολίτης Ένα")


class ExampleLabelTests(TestCase):
    def test_label_shown_only_for_examples(self):
        a = Party.objects.create(name="Ψευδο", responsible_persons="x", is_published=True, is_example=True)
        b = Party.objects.create(name="Αληθινό", responsible_persons="x", is_published=True)
        self.assertContains(self.client.get(reverse("party", args=[a.slug])), "Παράδειγμα")
        self.assertNotContains(self.client.get(reverse("party", args=[b.slug])), "Παράδειγμα")
        cat = self.client.get(reverse("catalog"), {"all": "1"})
        self.assertContains(cat, "pill-example", count=1)


class StaffRemoveCommentTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from .models import Comment, Decision

        self.p = Party.objects.create(name="ΠΠ", responsible_persons="x", is_published=True)
        self.t = Topic.objects.create(name="ΘΘ", slug="tt")
        text = {k: "κ" for k in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}
        self.prop = Proposal.objects.create(party=self.p, topic=self.t, title="Τ", source="https://example.org", is_published=True, **text)
        self.c = Comment.objects.create(proposal=self.prop, kind="comment", pseudonym="Χ", body="σχόλιο")
        self.User = get_user_model()

    def url(self):
        return reverse("staff_remove_comment", args=[self.c.pk])

    def test_icon_only_for_staff(self):
        page = reverse("proposal", args=[self.prop.pk])
        self.assertNotContains(self.client.get(page), self.url())
        self.User.objects.create_superuser("adm", "a@example.org", "pass-12345-x")
        self.client.login(username="adm", password="pass-12345-x")
        self.assertContains(self.client.get(page), self.url())

    def test_non_staff_gets_404_and_nothing_changes(self):
        self.assertEqual(self.client.post(self.url(), {"reason": "x"}).status_code, 404)
        self.User.objects.create_user("u", "u@example.org", "pass-12345-x")
        self.client.login(username="u", password="pass-12345-x")
        self.assertEqual(self.client.post(self.url(), {"reason": "x"}).status_code, 404)
        self.c.refresh_from_db()
        self.assertFalse(self.c.removed)

    def test_staff_removes_with_reason_and_logs(self):
        from .models import Decision

        self.User.objects.create_superuser("adm", "a@example.org", "pass-12345-x")
        self.client.login(username="adm", password="pass-12345-x")
        self.client.post(self.url(), {"reason": ""})
        self.c.refresh_from_db()
        self.assertFalse(self.c.removed)  # χωρίς αιτιολόγηση δεν αφαιρείται
        self.client.post(self.url(), {"reason": "Προσωπική επίθεση"})
        self.c.refresh_from_db()
        self.assertTrue(self.c.removed)
        self.assertTrue(Decision.objects.filter(subject__contains=str(self.c.pk), reason="Προσωπική επίθεση").exists())


class ThreadedRepliesTests(TestCase):
    def setUp(self):
        from . import totp
        from .models import Comment, TotpDevice

        self.p = Party.objects.create(name="ΟΟ", responsible_persons="x", is_published=True, tier=Party.TIER_FULL)
        make_member("o@example.org", self.p)
        self.t = Topic.objects.create(name="ΘΘΘ", slug="ttt")
        text = {k: "κ" for k in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}
        self.prop = Proposal.objects.create(party=self.p, topic=self.t, title="Τ", source="https://example.org", is_published=True, **text)
        self.q = Comment.objects.create(proposal=self.prop, kind="question", pseudonym="Ερωτών", body="Ποιο το κόστος;")
        self.Comment = Comment
        self.client.post(reverse("login"), {"email": "o@example.org", "password": PASSWORD})
        self.client.get(reverse("totp"))
        self.client.post(reverse("totp"), {"code": totp.code_now(TotpDevice.objects.get().secret)})

    def test_reply_is_nested_under_parent(self):
        self.client.post(reverse("official_reply", args=["protasi", self.prop.pk]), {"body": "Απάντηση Χ", "parent": str(self.q.pk)})
        reply = self.Comment.objects.get(body="Απάντηση Χ")
        self.assertEqual(reply.parent_id, self.q.pk)
        page = self.client.get(reverse("proposal", args=[self.prop.pk]))
        self.assertContains(page, "Απάντηση στο σχόλιο του «Ερωτών»")
        self.assertContains(page, 'class="replies"')
        self.assertEqual(len(page.context["comments"]), 1)  # η απάντηση δεν είναι κορυφαίο σχόλιο

    def test_general_reply_and_foreign_parent_ignored(self):
        other = self.Comment.objects.create(proposal=self.prop, kind="comment", pseudonym="Β", body="άλλο", removed=True)
        self.client.post(reverse("official_reply", args=["protasi", self.prop.pk]), {"body": "Γενική", "parent": str(other.pk)})
        self.assertIsNone(self.Comment.objects.get(body="Γενική").parent_id)  # αφαιρεμένο σχόλιο: χωρίς parent
