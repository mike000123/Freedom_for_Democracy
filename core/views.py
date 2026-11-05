import hashlib
import random
import re
import secrets
import unicodedata
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.db.models import Count, Q
from django.utils.http import urlencode
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import captcha, citizens, exposure, features, ratelimit
from .forms import ApplicationForm, CommentForm, QuestionForm
from .members import member_party
from .models import CitizenProposal, Comment, Decision, FeatureChange, FeatureFlag, Party, PrefOption, Proposal, Question, Topic

LINK_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
PROPOSAL_KINDS = [Comment.FOR, Comment.AGAINST, Comment.ASK]


def greek_key(text):
    """Αλφαβητική σειρά χωρίς επιρροή των τόνων."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def sort_by_name(items):
    return sorted(items, key=lambda p: greek_key(p.name))


def _accounts_mode(request):
    return features.enabled(request, "citizen_accounts")


def _strip_anonymous_fields(form):
    """Με λογαριασμό δεν χρειάζονται ψευδώνυμο, captcha και honeypot."""
    for name in ("pseudonym", "captcha", "website"):
        form.fields.pop(name, None)


def _need_account(request):
    """Στη λειτουργία λογαριασμών η υποβολή θέλει επαληθευμένο λογαριασμό. Επιστρέφει redirect ή None."""
    profile = citizens.citizen_of(request)
    if profile is None:
        messages.error(request, "Συνδεθείτε ή δημιουργήστε λογαριασμό για να δημοσιεύσετε.")
        return redirect(f"{reverse('login')}?next={request.path}")
    if not profile.verified:
        messages.error(request, "Επιβεβαιώστε πρώτα το email σας.")
        return redirect("citizen_account")
    return None


def _guard(request, body, account=False):
    """Κοινοί έλεγχοι ανεπιθύμητων υποβολών. Επιστρέφει μήνυμα σφάλματος ή None."""
    if not account:
        if request.POST.get("website"):
            return "Η υποβολή απορρίφθηκε."
        if not captcha.verify(request, request.POST.get("captcha", "")):
            return "Λάθος απάντηση στην επαλήθευση. Δοκιμάστε ξανά."
    if LINK_RE.search(body):
        return "Στο πρωτότυπο δεν επιτρέπονται σύνδεσμοι στα κείμενα των πολιτών."
    since = timezone.now() - timedelta(days=1)
    if (
        Comment.objects.filter(body=body, created_at__gte=since).exists()
        or Question.objects.filter(body=body, created_at__gte=since).exists()
    ):
        return "Το ίδιο κείμενο έχει ήδη υποβληθεί."
    allowed, msg = ratelimit.check_and_record(request)
    if not allowed:
        return msg
    return None


def _new_code():
    code = secrets.token_urlsafe(6)
    return code, hashlib.sha256(code.encode()).hexdigest()


# ------------------------------------------------------------------ σελίδες


def _donut(segments):
    """Υπολογίζει τα τόξα του δακτυλιοειδούς γραφήματος (SVG, r=70)."""
    circ = 439.8
    total = sum(v for _, v, _ in segments) or 1
    out, offset = [], 0.0
    for label, value, css in segments:
        length = round(circ * value / total, 1)
        out.append({"label": label, "value": value, "css": css, "dash": length, "gap": round(circ - length, 1), "offset": -round(offset, 1)})
        offset += length
    return out


def home(request):
    """Αρχική: μόνο στατιστικά. Δεν προβάλλει κανένα κόμμα (ισότιμη έκθεση)."""
    parties = Party.objects.filter(is_published=True)
    n_full = parties.filter(kind=Party.KIND_PARTY, tier=Party.TIER_FULL).count()
    n_progress = parties.filter(kind=Party.KIND_PARTY, tier=Party.TIER_PROGRESS).count()
    n_groups = parties.filter(kind=Party.KIND_GROUP).count()
    proposals = Proposal.objects.filter(is_published=True, party__is_published=True)
    questions = Question.objects.filter(removed=False)
    n_questions = questions.count()
    answered = questions.filter(comments__official_party__isnull=False, comments__removed=False).distinct().count()
    per_topic = list(
        Topic.objects.annotate(n=Count("proposals", filter=Q(proposals__is_published=True, proposals__party__is_published=True)))
        .order_by("-n", "name")[:6]
    )
    top = max([t.n for t in per_topic] or [1]) or 1
    for t in per_topic:
        t.bar = 5 * round(20 * t.n / top)  # βήματα 5% για κλάσεις CSS (χωρίς inline στυλ)
    week = timezone.now() - timedelta(days=7)
    ctx = {
        "n_total": n_full + n_progress + n_groups,
        "n_answered": answered,
        "n_new_questions": questions.filter(created_at__gte=week).count(),
        "n_parties": n_full + n_progress,
        "n_groups": n_groups,
        "n_proposals": proposals.count(),
        "n_questions": n_questions,
        "answer_pct": round(100 * answered / n_questions) if n_questions else 0,
        "answer_bar": 5 * round(answered * 20 / n_questions) if n_questions else 0,
        "donut": _donut([
            ("Πλήρες προφίλ", n_full, "seg-navy"),
            ("Προφίλ σε εξέλιξη", n_progress, "seg-red"),
            ("Ομάδες υπό σύσταση", n_groups, "seg-pale"),
        ]),
        "per_topic": per_topic,
        "topics": Topic.objects.all(),
    }
    return render(request, "core/home.html", ctx)


def catalog(request):
    """Κόμματα και ομάδες. Χωρίς φίλτρα: τρεις ενότητες με ισότιμη εναλλαγή.
    Με φίλτρα ή ?all=1: όλα τα αποτελέσματα σε τυχαία σειρά (χωρίς καταγραφή εμφανίσεων)."""
    quiz_on = features.enabled(request, "questionnaire")
    if request.method == "POST" and not quiz_on:
        raise Http404
    kind = request.GET.get("kind", "all")
    tier = request.GET.get("tier", "")
    topic_slug = request.GET.get("topic", "")
    q = request.GET.get("q", "").strip()[:80]
    show_all = request.GET.get("all") == "1"
    filtered = bool(q or topic_slug or tier or kind in (Party.KIND_PARTY, Party.KIND_GROUP) or show_all)
    ctx = {"topics": Topic.objects.all(), "kind": kind, "tier": tier, "topic_slug": topic_slug, "q": q, "filtered": filtered}
    if quiz_on:
        quiz_topics = _quiz_topics()
        ctx["quiz_topics"] = quiz_topics
        if request.method == "POST":
            ctx["quiz_results"] = _quiz_results(request, quiz_topics)
            ctx["quiz_done"] = True
    if not filtered:
        ctx["n_full"] = exposure.eligible(Party.KIND_PARTY, Party.TIER_FULL).count()
        ctx["n_progress"] = exposure.eligible(Party.KIND_PARTY, Party.TIER_PROGRESS).count()
        ctx["n_groups"] = exposure.eligible(Party.KIND_GROUP).count()
        record = request.method == "GET"
        ctx.update(
            main=exposure.pick(Party.KIND_PARTY, Party.TIER_FULL, settings.FD_HOME_SLOTS, record),
            progress=exposure.pick(Party.KIND_PARTY, Party.TIER_PROGRESS, settings.FD_PROGRESS_SLOTS, record),
            groups=exposure.pick(Party.KIND_GROUP, None, settings.FD_GROUP_SLOTS, record),
        )
    else:
        qs = Party.objects.filter(is_published=True)
        if kind in (Party.KIND_PARTY, Party.KIND_GROUP):
            qs = qs.filter(kind=kind)
        if tier in (Party.TIER_FULL, Party.TIER_PROGRESS):
            qs = qs.filter(tier=tier)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(slogan__icontains=q))
        if topic_slug:
            qs = qs.filter(proposals__topic__slug=topic_slug, proposals__is_published=True).distinct()
        parties = list(qs)
        random.shuffle(parties)  # τυχαία σειρά και στα αποτελέσματα φίλτρων
        ctx["parties"] = parties
    return render(request, "core/catalog.html", ctx)


MAX_COMPARE = 12


def _citizen_compare_on(request):
    return features.enabled(request, "citizen_proposals") and _accounts_mode(request)


def compare(request):
    """Σύγκριση προτάσεων ανά θέμα: κόμματα, ομάδες και πολίτες μαζί (έως 12 στήλες).
    Χωρίς βαθμολογία ή κατάταξη: οι στήλες έρχονται σε τυχαία σειρά."""
    if not features.enabled(request, "comparison"):
        raise Http404
    topics = Topic.objects.all()
    topic = topics.filter(slug=request.GET.get("topic", "")).first()
    parties = Party.objects.filter(is_published=True)
    citizens_on = _citizen_compare_on(request)
    cit_qs = CitizenProposal.objects.filter(topic=topic, removed=False).select_related("author") if topic else CitizenProposal.objects.none()
    chosen, cit_chosen, slugs, cit_ids = [], [], [], []
    if topic:
        if request.GET.get("all"):
            chosen = list(parties.filter(proposals__topic=topic, proposals__is_published=True).distinct())
            cit_chosen = list(cit_qs) if citizens_on else []
        else:
            slugs = list(dict.fromkeys(request.GET.getlist("p")))
            chosen = list(parties.filter(slug__in=slugs))
            if citizens_on:
                ids = [i for i in dict.fromkeys(request.GET.getlist("c")) if i.isdigit()]
                cit_chosen = list(cit_qs.filter(pk__in=ids))
        slugs = [c.slug for c in chosen]
        cit_ids = [str(c.pk) for c in cit_chosen]
    columns, error = [], ""
    if topic and (chosen or cit_chosen):
        props = {p.party_id: p for p in topic.proposals.filter(is_published=True, party__in=chosen)}
        cols = [{"kind": "party", "name": c.name, "url": reverse("party", args=[c.slug]), "proposal": props.get(c.pk),
                 "badge": c.get_kind_display(), "example": c.is_example} for c in chosen]
        cols += [{"kind": "citizen", "name": c.author.display_name, "url": reverse("citizen_proposal", args=[c.pk]),
                  "proposal": c, "badge": c.author.public_label, "example": c.author.is_example} for c in cit_chosen]
        if len(cols) < 2:
            error = "Επιλέξτε τουλάχιστον δύο προτάσεις."
        else:
            random.shuffle(cols)
            columns = cols[:MAX_COMPARE]
    rows = []
    for i, (_, label) in enumerate(Proposal.FIELDS):
        if columns:
            rows.append({"label": label, "cells": [c["proposal"].sections[i][1] if c["proposal"] else None for c in columns]})
    ctx = {"topics": topics, "all_parties": sort_by_name(parties), "topic": topic, "selected": slugs, "selected_cit": cit_ids,
           "citizen_options": list(cit_qs) if (topic and citizens_on) else [], "columns": columns, "rows": rows, "error": error}
    return render(request, "core/compare.html", ctx)


def health(request):
    return JsonResponse({"application": "freedom-for-democracy", "status": "ok"})


def apply_view(request):
    """Δημόσια αίτηση συμμετοχής κόμματος ή ομάδας. Ο έλεγχος γίνεται από τη διαχείριση."""
    if not features.enabled(request, "applications"):
        raise Http404
    form = ApplicationForm(request.POST or None)
    if request.method == "POST":
        if request.POST.get("website_url"):
            return redirect("home")  # honeypot
        if form.is_valid():
            if not captcha.verify(request, form.cleaned_data["captcha"]):
                form.add_error("captcha", "Λάθος απάντηση στην επαλήθευση.")
            else:
                allowed, msg = ratelimit.check_and_record(request, scope="apply", hour=3, day=5)
                if not allowed:
                    form.add_error(None, msg)
                else:
                    form.save()
                    messages.success(request, "Η αίτησή σας καταχωρίστηκε. Θα ελεγχθεί και θα λάβετε απάντηση στο email που δηλώσατε.")
                    return redirect("home")
    return render(request, "core/apply.html", {"form": form, "captcha_q": captcha.new_challenge(request)})


def party_detail(request, slug):
    party = get_object_or_404(Party, slug=slug, is_published=True)
    proposals = party.proposals.filter(is_published=True).select_related("topic")
    ctx = {"party": party, "proposals": proposals, "changes": party.changes.all()[:15]}
    return render(request, "core/party.html", ctx)


def topics_index(request):
    topics = Topic.objects.annotate(
        n_prop=Count("proposals", filter=Q(proposals__is_published=True, proposals__party__is_published=True), distinct=True),
        n_q=Count("questions", filter=Q(questions__removed=False), distinct=True),
    )
    return render(request, "core/topics.html", {"topics": topics})


def _citizen_proposals(request, topic):
    if not (features.enabled(request, "citizen_proposals") and _accounts_mode(request)):
        return None
    items = list(CitizenProposal.objects.filter(topic=topic, removed=False).select_related("author"))
    random.shuffle(items)
    return items


def topic_detail(request, slug):
    topic = get_object_or_404(Topic, slug=slug)
    citizen_props = _citizen_proposals(request, topic)
    proposals = list(
        topic.proposals.filter(is_published=True, party__is_published=True).select_related("party")
    )
    random.shuffle(proposals)  # τυχαία σειρά: καμία θέση δεν προβάλλεται συστηματικά
    with_position = {p.party_id for p in proposals}
    missing = sort_by_name([p for p in Party.objects.filter(is_published=True) if p.pk not in with_position])
    questions = topic.questions.filter(removed=False).annotate(n=Count("comments"))

    account = _accounts_mode(request)
    form = QuestionForm(request.POST or None)
    if account:
        _strip_anonymous_fields(form)
    if request.method == "POST" and account:
        blocked = _need_account(request)
        if blocked:
            return blocked
    if request.method == "POST" and form.is_valid():
        err = _guard(request, form.cleaned_data["body"], account=account)
        if err:
            form.add_error(None, err)
        else:
            profile = citizens.citizen_of(request) if account else None
            q = Question.objects.create(
                topic=topic,
                pseudonym=profile.display_name if profile else form.cleaned_data["pseudonym"],
                body=form.cleaned_data["body"],
                author=profile,
            )
            messages.success(request, "Το ερώτημά σας δημοσιεύτηκε.")
            return redirect("question", pk=q.pk)
    ctx = {
        "topic": topic,
        "proposals": proposals,
        "missing": missing,
        "questions": questions,
        "citizen_proposals": citizen_props,
        "compare_possible": len(proposals) + len(citizen_props or []) > 1,
        "form": form,
        "captcha_q": captcha.new_challenge(request),
    }
    return render(request, "core/topic.html", ctx)


def _comments_for(request, qs):
    sort = request.GET.get("sort", "time")
    kind = request.GET.get("type", "")
    if kind in dict(Comment.KINDS):
        qs = qs.filter(kind=kind)
    items = list(qs.filter(parent__isnull=True).select_related("official_party"))
    if sort == "random":
        random.shuffle(items)
    replies = {}
    for r in Comment.objects.filter(parent__in=items).select_related("official_party").order_by("created_at"):
        replies.setdefault(r.parent_id, []).append(r)
    for c in items:
        c.reply_list = replies.get(c.pk, [])
    return items, sort, kind


def proposal_detail(request, pk):
    proposal = get_object_or_404(
        Proposal.objects.select_related("party", "topic"),
        pk=pk,
        is_published=True,
        party__is_published=True,
    )
    account = _accounts_mode(request)
    form = CommentForm(request.POST or None, kinds=PROPOSAL_KINDS)
    if account:
        _strip_anonymous_fields(form)
    if request.method == "POST" and account:
        blocked = _need_account(request)
        if blocked:
            return blocked
    if request.method == "POST" and form.is_valid():
        err = _guard(request, form.cleaned_data["body"], account=account)
        if err:
            form.add_error(None, err)
        else:
            profile = citizens.citizen_of(request) if account else None
            code, code_hash = _new_code()
            Comment.objects.create(
                proposal=proposal,
                kind=form.cleaned_data["kind"],
                pseudonym=profile.display_name if profile else form.cleaned_data["pseudonym"],
                body=form.cleaned_data["body"],
                delete_code_hash="" if profile else code_hash,
                author=profile,
            )
            messages.success(
                request,
                "Το σχόλιο δημοσιεύτηκε. Μπορείτε να το διαγράψετε από εσάς όσο είστε συνδεδεμένοι."
                if profile
                else f"Το σχόλιο δημοσιεύτηκε. Κωδικός διαγραφής: {code}. Φυλάξτε τον, δεν θα εμφανιστεί ξανά.",
            )
            return redirect("proposal", pk=proposal.pk)
    mine = member_party(request)
    comments, sort, kind = _comments_for(request, proposal.comments.all())
    ctx = {
        "proposal": proposal,
        "comments": comments,
        "sort": sort,
        "type": kind,
        "kinds": [(k, label) for k, label in Comment.KINDS if k in PROPOSAL_KINDS],
        "can_reply": bool(mine and mine.pk == proposal.party_id and mine.is_published),
        "form": form,
        "captcha_q": captcha.new_challenge(request),
    }
    return render(request, "core/proposal.html", ctx)


def question_detail(request, pk):
    question = get_object_or_404(Question.objects.select_related("topic"), pk=pk, removed=False)
    account = _accounts_mode(request)
    form = CommentForm(request.POST or None, kinds=[Comment.PLAIN])
    if account:
        _strip_anonymous_fields(form)
    if request.method == "POST" and account:
        blocked = _need_account(request)
        if blocked:
            return blocked
    if request.method == "POST" and form.is_valid():
        err = _guard(request, form.cleaned_data["body"], account=account)
        if err:
            form.add_error(None, err)
        else:
            profile = citizens.citizen_of(request) if account else None
            code, code_hash = _new_code()
            Comment.objects.create(
                question=question,
                kind=Comment.PLAIN,
                pseudonym=profile.display_name if profile else form.cleaned_data["pseudonym"],
                body=form.cleaned_data["body"],
                delete_code_hash="" if profile else code_hash,
                author=profile,
            )
            messages.success(
                request,
                "Το σχόλιο δημοσιεύτηκε. Μπορείτε να το διαγράψετε από εσάς όσο είστε συνδεδεμένοι."
                if profile
                else f"Το σχόλιο δημοσιεύτηκε. Κωδικός διαγραφής: {code}. Φυλάξτε τον, δεν θα εμφανιστεί ξανά.",
            )
            return redirect("question", pk=question.pk)
    mine = member_party(request)
    comments, sort, _ = _comments_for(request, question.comments.all())
    ctx = {
        "question": question,
        "can_reply": bool(mine and mine.is_published),
        "comments": comments,
        "sort": sort,
        "form": form,
        "captcha_q": captcha.new_challenge(request),
    }
    return render(request, "core/question.html", ctx)


def rules(request):
    return render(request, "core/rules.html")


def transparency(request):
    features.ensure_flags()
    since = timezone.now() - timedelta(days=7)
    parties = Party.objects.filter(is_published=True).annotate(
        total=Count("impressions", distinct=True),
        week=Count("impressions", filter=Q(impressions__shown_at__gte=since), distinct=True),
    )
    ctx = {
        "parties": sort_by_name(parties),
        "decisions": Decision.objects.all()[:100],
        "n_impressions": sum(p.total for p in parties),
        "n_decisions_total": Decision.objects.count(),
        "flags": FeatureFlag.objects.all(),
        "flag_changes": FeatureChange.objects.select_related("flag")[:30],
        "since": since,
    }
    return render(request, "core/transparency.html", ctx)


# ------------------------------------------------------------------ ενέργειες


def _back(comment):
    if comment.proposal_id:
        return redirect("proposal", pk=comment.proposal_id)
    return redirect("question", pk=comment.question_id)


@require_POST
def report_comment(request, pk):
    comment = get_object_or_404(Comment, pk=pk, removed=False)
    allowed, msg = ratelimit.check_and_record(request)
    if not allowed:
        messages.error(request, msg)
    else:
        Comment.objects.filter(pk=pk).update(report_count=comment.report_count + 1)
        messages.success(request, "Η αναφορά καταγράφηκε και θα εξεταστεί.")
    return _back(comment)


@require_POST
def staff_remove_comment(request, pk):
    """Αφαίρεση σχολίου από διαχειριστή με δημόσια αιτιολόγηση. Καταγράφεται στο αρχείο αποφάσεων."""
    if not (request.user.is_authenticated and request.user.is_staff):
        raise Http404
    comment = get_object_or_404(Comment, pk=pk, removed=False)
    reason = request.POST.get("reason", "").strip()[:500]
    if not reason:
        messages.error(request, "Η αιτιολόγηση είναι υποχρεωτική και εμφανίζεται δημόσια στο αρχείο αποφάσεων.")
    else:
        comment.removed = True
        comment.moderation_note = reason
        comment.save()
        Decision.objects.create(subject=f"Σχόλιο #{comment.pk}", decision=Decision.REMOVED, reason=reason)
        messages.success(request, "Το σχόλιο αφαιρέθηκε και καταγράφηκε στο αρχείο αποφάσεων.")
    return _back(comment)


@require_POST
def delete_comment(request, pk):
    comment = get_object_or_404(Comment, pk=pk, removed=False)
    code = request.POST.get("code", "").strip()
    mine = citizens.citizen_of(request)
    by_account = bool(comment.author_id and mine and mine.pk == comment.author_id)
    if by_account or (code and comment.delete_code_hash and hashlib.sha256(code.encode()).hexdigest() == comment.delete_code_hash):
        comment.removed = True
        comment.removed_by_author = True
        comment.body = ""
        comment.save()
        messages.success(request, "Το σχόλιο διαγράφηκε.")
    else:
        messages.error(request, "Λάθος κωδικός διαγραφής.")
    return _back(comment)



def _quiz_topics():
    return list(Topic.objects.filter(pref_question__isnull=False).select_related("pref_question")
                .prefetch_related("pref_question__options"))


def _quiz_results(request, topics):
    """Αποτέλεσμα του ανώνυμου ερωτηματολογίου προτιμήσεων: ανά θέμα, οι προτάσεις που υποστηρίζουν την απάντηση,
    σε τυχαία σειρά. Καμία βαθμολογία ή κατάταξη κομμάτων και καμία αποθήκευση απαντήσεων."""
    results = []
    for topic in topics:
        raw = request.POST.get(f"q{topic.pk}", "")
        option = next((o for o in topic.pref_question.options.all() if str(o.pk) == raw), None)
        if option is None:
            continue
        base = Proposal.objects.filter(topic=topic, is_published=True, party__is_published=True)
        matches = list(base.filter(stance=option).select_related("party"))
        random.shuffle(matches)
        link = ""
        if len(matches) >= 2 and features.enabled(request, "comparison"):
            link = reverse("compare") + "?" + urlencode([("topic", topic.slug)] + [("p", m.party.slug) for m in matches[:MAX_COMPARE]])
        results.append({"topic": topic, "question": topic.pref_question, "option": option, "matches": matches,
                        "undeclared": base.filter(stance__isnull=True).count(), "compare_link": link})
    return results
