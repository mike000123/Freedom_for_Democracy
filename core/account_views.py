"""Είσοδος και διαχείριση για εκπροσώπους κομμάτων: κωδικός και TOTP (2FA)."""
import time

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from . import ratelimit, totp
from .forms import LoginForm, PeopleForm, ProfileForm, VideosForm, ProposalForm, TotpForm
from .members import member_party, member_required
from .models import ChangeLogEntry, Comment, PartyPerson, PartyVideo, Proposal, Question, Topic, TotpDevice

def _display(value):
    if value is True:
        return "Ναι"
    if value is False:
        return "Όχι"
    return "" if value is None else str(value)


def field_diff(form):
    """Λίστα {field,label,before,after} με τις τιμές πριν την αποθήκευση.
    Χρησιμοποιεί form.initial: το is_valid() έχει ήδη αλλάξει την instance."""
    out = []
    for name in form.changed_data:
        before = form.initial.get(name)
        if name == "topic" and before:
            before = Topic.objects.filter(pk=before).first()
        out.append({
            "field": name,
            "label": form.fields[name].label.split(" (")[0],
            "before": _display(before)[:600],
            "after": _display(form.cleaned_data.get(name))[:600],
        })
    return out


PENDING_TTL = 600  # δευτερόλεπτα ανάμεσα στον κωδικό και τον κωδικό 2FA
User = get_user_model()


def _pending_user(request):
    pending = request.session.get("pending_2fa")
    if not pending or time.time() - pending["at"] > PENDING_TTL:
        request.session.pop("pending_2fa", None)
        return None
    user = User.objects.filter(pk=pending["uid"], is_active=True).first()
    return user if user is not None and hasattr(user, "membership") else None


def _safe_next(request, default):
    nxt = request.GET.get("next", "")
    return nxt if nxt.startswith("/") and not nxt.startswith("//") else default


def login_view(request):
    """Μία είσοδος για όλους. Μετά τον έλεγχο κωδικού η κατεύθυνση εξαρτάται από τον ρόλο:
    εκπρόσωπος κόμματος → δεύτερος παράγοντας, πολίτης → λογαριασμός, διαχειριστής → διαχείριση."""
    from .models import CitizenProfile

    if member_party(request):
        return redirect("manage")
    form = LoginForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        ok, msg = ratelimit.allowed(request, "login", hour=settings.FD_LOGIN_RATE_HOUR, day=settings.FD_LOGIN_RATE_HOUR * 3)
        if not ok:
            form.add_error(None, msg)
        else:
            ident = form.cleaned_data["email"].strip()
            password = form.cleaned_data["password"]
            user = authenticate(request, username=ident.lower(), password=password) or authenticate(
                request, username=ident, password=password)
            if user is None:
                ratelimit.record(request, "login")
                form.add_error(None, "Λάθος στοιχεία ή κωδικός.")
            elif hasattr(user, "membership") and settings.FD_DEMO_LOGINS and user.membership.party.is_example:
                # Επίδειξη: τα κόμματα δείγματος δεν ζητούν 2FA (μόνο με FD_DEMO_LOGINS)
                login(request, user)
                return redirect("manage")
            elif hasattr(user, "membership"):
                request.session["pending_2fa"] = {"uid": user.pk, "at": time.time()}
                return redirect("totp")
            elif CitizenProfile.objects.filter(user=user).exists():
                login(request, user)
                return redirect(_safe_next(request, "citizen_account"))
            elif user.is_staff:
                login(request, user)
                return redirect(_safe_next(request, "/admin/"))
            else:
                ratelimit.record(request, "login")
                form.add_error(None, "Λάθος στοιχεία ή κωδικός.")
    return render(request, "core/login.html", {"form": form})


def totp_view(request):
    user = _pending_user(request)
    if user is None:
        return redirect("login")
    device, _ = TotpDevice.objects.get_or_create(user=user, defaults={"secret": totp.new_secret()})
    form = TotpForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        ok, msg = ratelimit.allowed(request, "login", hour=settings.FD_LOGIN_RATE_HOUR, day=settings.FD_LOGIN_RATE_HOUR * 3)
        if not ok:
            form.add_error(None, msg)
        else:
            counter = totp.verify(device.secret, form.cleaned_data["code"], device.last_counter)
            if counter is None:
                ratelimit.record(request, "login")
                form.add_error("code", "Λάθος ή ληγμένος κωδικός.")
            else:
                device.last_counter = counter
                device.confirmed = True
                device.save()
                request.session.pop("pending_2fa", None)
                login(request, user, backend="django.contrib.auth.backends.ModelBackend")
                return redirect("manage")
    ctx = {
        "form": form,
        "setup": not device.confirmed,
        "secret": totp.grouped(device.secret),
        "uri": totp.uri(device.secret, user.username),
    }
    return render(request, "core/totp.html", ctx)


@require_POST
def logout_view(request):
    logout(request)
    messages.success(request, "Αποσυνδεθήκατε.")
    return redirect("home")


# ------------------------------------------------------------------ πάνελ κόμματος

PROFILE_CHECKLIST = [
    ("slogan", "Σύνθημα"),
    ("founders", "Ιδρυτές"),
    ("funding", "Δήλωση χρηματοδότησης"),
    ("website", "Επίσημη ιστοσελίδα"),
]


@member_required
def manage_home(request):
    party = request.member_party
    proposals = party.proposals.select_related("topic")
    checklist = [(label, bool(getattr(party, field))) for field, label in PROFILE_CHECKLIST]
    checklist.append(("Τουλάχιστον μία δημοσιευμένη δομημένη πρόταση", proposals.filter(is_published=True).exists()))
    incoming = []
    asks = Comment.objects.filter(proposal__party=party, kind=Comment.ASK, removed=False).select_related("proposal")
    for c in asks.order_by("-created_at")[:20]:
        answered = Comment.objects.filter(
            proposal=c.proposal, official_party=party, created_at__gt=c.created_at
        ).exists()
        incoming.append((c, answered))
    ctx = {
        "party": party,
        "proposals": proposals,
        "checklist": checklist,
        "incoming": incoming,
        "open_questions": Question.objects.filter(removed=False).select_related("topic")[:10],
    }
    return render(request, "core/manage.html", ctx)


@member_required
def people_edit(request):
    party = request.member_party
    form = PeopleForm(request.POST or None, party=party)
    if request.method == "POST" and form.is_valid():
        changed = []
        for i, n in form.names:
            vals = form.values(i)
            obj = PartyPerson.objects.filter(party=party, name=n).first()
            if obj and all(getattr(obj, k) == v for k, v in vals.items()):
                continue
            empty = not any(v for k, v in vals.items() if k != "public_office") and vals["public_office"] == PartyPerson.OFFICE_NONE
            if empty:
                if not obj:
                    continue
                obj.delete()
            else:
                PartyPerson.objects.update_or_create(party=party, name=n, defaults=vals)
            changed.append(n)
        if changed:
            ChangeLogEntry.objects.create(party=party, summary="Ενημερώθηκε το βιογραφικό: " + ", ".join(changed))
        messages.success(request, "Τα βιογραφικά αποθηκεύτηκαν.")
        return redirect("manage")
    return render(request, "core/people_edit.html", {"form": form, "party": party})


@member_required
def videos_edit(request):
    party = request.member_party
    form = VideosForm(request.POST or None, party=party)
    if request.method == "POST" and form.is_valid():
        new = form.items()
        if new != [(v.url, v.title) for v in party.videos.all()]:
            party.videos.all().delete()
            PartyVideo.objects.bulk_create([PartyVideo(party=party, url=u, title=t, position=i) for i, (u, t) in enumerate(new)])
            ChangeLogEntry.objects.create(party=party, summary=f"Ενημερώθηκαν τα προωθούμενα βίντεο ({len(new)})")
        messages.success(request, "Τα βίντεο αποθηκεύτηκαν.")
        return redirect("manage")
    return render(request, "core/videos_edit.html", {"form": form, "party": party})


@member_required
def profile_edit(request):
    party = request.member_party
    form = ProfileForm(request.POST or None, request.FILES or None, instance=party)
    if request.method == "POST" and form.is_valid():
        if form.has_changed():
            details = field_diff(form)
            form.save()
            labels = [d["label"] for d in details]
            ChangeLogEntry.objects.create(party=party, summary="Ενημερώθηκε το προφίλ: " + ", ".join(labels), details=details)
        messages.success(request, "Το προφίλ αποθηκεύτηκε.")
        return redirect("manage")
    return render(request, "core/form_page.html", {"form": form, "title": "Επεξεργασία προφίλ", "party": party})


@member_required
def proposal_edit(request, pk=None):
    party = request.member_party
    instance = get_object_or_404(Proposal, pk=pk, party=party) if pk else None
    form = ProposalForm(request.POST or None, instance=instance)
    if request.method == "POST" and form.is_valid():
        if instance is None or form.has_changed():
            was_published = bool(form.initial.get("is_published")) if instance else False  # το is_valid() έχει αλλάξει την instance
            details = [] if instance is None else field_diff(form)
            obj = form.save(commit=False)
            obj.party = party
            obj.save()
            # Μη δημοσιευμένα προσχέδια δεν καταγράφονται στο δημόσιο ιστορικό.
            if obj.is_published or was_published:
                if instance is None:
                    summary = f"Νέα πρόταση: {obj.title} ({obj.topic.name})"
                elif not was_published:
                    summary = f"Δημοσιεύτηκε η πρόταση «{obj.title}» ({obj.topic.name})"
                    details = []
                else:
                    summary = f"Ενημερώθηκε η πρόταση «{obj.title}»: " + ", ".join(d["label"] for d in details)
                ChangeLogEntry.objects.create(party=party, summary=summary[:300], details=details)
        messages.success(request, "Η πρόταση αποθηκεύτηκε.")
        return redirect("manage")
    title = "Νέα δομημένη πρόταση" if instance is None else "Επεξεργασία πρότασης"
    return render(request, "core/form_page.html", {"form": form, "title": title, "party": party})


@require_POST
@member_required
def official_reply(request, kind, pk):
    party = request.member_party
    if kind == "protasi":
        target = get_object_or_404(Proposal, pk=pk, party=party, is_published=True)
        extra = {"proposal": target}
        back = redirect("proposal", pk=pk)
    elif kind == "erotima":
        target = get_object_or_404(Question, pk=pk, removed=False)
        extra = {"question": target}
        back = redirect("question", pk=pk)
    else:
        return redirect("home")
    body = request.POST.get("body", "").strip()
    if not party.is_published:
        messages.error(request, "Το κόμμα δεν έχει δημοσιευτεί ακόμη.")
    elif not body or len(body) > 1000:
        messages.error(request, "Η απάντηση πρέπει να έχει έως 1.000 χαρακτήρες.")
    else:
        parent = None
        parent_id = request.POST.get("parent", "")
        if parent_id.isdigit():
            parent = Comment.objects.filter(pk=int(parent_id), parent__isnull=True, removed=False, **extra).first()
        Comment.objects.create(
            kind=Comment.PLAIN, pseudonym=party.name, body=body, official_party=party, parent=parent, **extra
        )
        messages.success(request, "Η επίσημη απάντηση δημοσιεύτηκε.")
    return back
