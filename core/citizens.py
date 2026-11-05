"""Λογαριασμοί πολιτών και οργανισμών (κανάλια, εκπομπές, ομάδες) με επαληθευμένο email,
και δομημένες προτάσεις πολιτών (μία ανά θέμα και λογαριασμό)."""
import functools

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login
from django.core import signing
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.http import Http404

from . import captcha, features, ratelimit
from .forms import CitizenProposalForm, DeleteAccountForm, LoginForm, RegisterForm
from .models import CitizenProfile, CitizenProposal, Comment, Question, Topic

User = get_user_model()
SALT = "fd-email-verify"
GENERIC = "Αν το email μπορεί να χρησιμοποιηθεί, στάλθηκε σύνδεσμος επιβεβαίωσης. Ελέγξτε και τον φάκελο ανεπιθύμητων."


def citizen_of(request):
    """Το προφίλ πολίτη του συνδεδεμένου χρήστη ή None."""
    if not hasattr(request, "_citizen"):
        user = getattr(request, "user", None)
        profile = None
        if user is not None and user.is_authenticated:
            profile = CitizenProfile.objects.filter(user=user).first()
        request._citizen = profile
    return request._citizen


def citizen_required(view):
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        profile = citizen_of(request)
        if profile is None:
            messages.error(request, "Συνδεθείτε ή δημιουργήστε λογαριασμό για να συνεχίσετε.")
            return redirect(f"{reverse('login')}?next={request.path}")
        request.citizen = profile
        return view(request, *args, **kwargs)

    return wrapper


def verified_required(view):
    @citizen_required
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.citizen.verified:
            messages.error(request, "Επιβεβαιώστε πρώτα το email σας (δείτε τον σύνδεσμο που σας στείλαμε).")
            return redirect("citizen_account")
        return view(request, *args, **kwargs)

    return wrapper


def send_verification(request, user):
    token = signing.dumps(user.pk, salt=SALT)
    link = request.build_absolute_uri(reverse("citizen_verify", args=[token]))
    send_mail(
        "Επιβεβαίωση email · Freedom for Democracy",
        "Για να ενεργοποιήσετε τον λογαριασμό σας ανοίξτε τον σύνδεσμο:\n\n"
        f"{link}\n\nΙσχύει για 3 ημέρες. Αν δεν δημιουργήσατε εσείς λογαριασμό, αγνοήστε αυτό το μήνυμα.",
        None,
        [user.email],
    )


def register(request):
    form = RegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        d = form.cleaned_data
        if d["website"]:
            return redirect("home")  # honeypot
        if not captcha.verify(request, d["captcha"]):
            form.add_error("captcha", "Λάθος απάντηση στην επαλήθευση.")
        else:
            ok, msg = ratelimit.check_and_record(
                request, scope="register", hour=settings.FD_REGISTER_RATE_HOUR, day=settings.FD_REGISTER_RATE_DAY
            )
            if not ok:
                form.add_error(None, msg)
            else:
                if not User.objects.filter(username=d["email"]).exists():  # δεν αποκαλύπτουμε αν υπάρχει το email
                    user = User.objects.create_user(d["email"], d["email"], d["password1"])
                    CitizenProfile.objects.create(
                        user=user, display_name=d["display_name"], kind=d["kind"],
                        org_type=d["org_type"], contact_person=d["contact_person"].strip(),
                    )
                    send_verification(request, user)
                messages.success(request, GENERIC)
                return redirect("login")
    return render(request, "core/citizen_register.html", {"form": form, "captcha_q": captcha.new_challenge(request)})


def verify(request, token):
    try:
        pk = signing.loads(token, salt=SALT, max_age=settings.FD_VERIFY_MAX_AGE)
        profile = CitizenProfile.objects.get(user_id=pk)
    except (signing.BadSignature, CitizenProfile.DoesNotExist):
        messages.error(request, "Ο σύνδεσμος δεν ισχύει ή έχει λήξει. Συνδεθείτε και ζητήστε νέο.")
        return redirect("login")
    if not profile.verified:
        profile.verified_at = timezone.now()
        profile.save(update_fields=["verified_at"])
    messages.success(request, "Το email επιβεβαιώθηκε. Μπορείτε να συνδεθείτε.")
    return redirect("login")


def citizen_login(request):
    """Παλιά διεύθυνση εισόδου πολιτών: η είσοδος είναι πλέον κοινή για όλους."""
    from django.urls import reverse
    from django.utils.http import urlencode

    nxt = request.GET.get("next")
    return redirect(reverse("login") + ("?" + urlencode({"next": nxt}) if nxt else ""))


@citizen_required
def account(request):
    return render(request, "core/citizen_account.html", {"profile": request.citizen, "delete_form": DeleteAccountForm()})


@require_POST
@citizen_required
def resend(request):
    if request.citizen.verified:
        return redirect("citizen_account")
    ok, msg = ratelimit.check_and_record(request, scope="register", hour=settings.FD_REGISTER_RATE_HOUR, day=settings.FD_REGISTER_RATE_DAY)
    if ok:
        send_verification(request, request.user)
        messages.success(request, "Στάλθηκε νέος σύνδεσμος επιβεβαίωσης.")
    else:
        messages.error(request, msg)
    return redirect("citizen_account")


@require_POST
@citizen_required
def delete_account(request):
    form = DeleteAccountForm(request.POST)
    if form.is_valid() and request.user.check_password(form.cleaned_data["password"]):
        profile = request.citizen
        Comment.objects.filter(author=profile).update(pseudonym="Διαγραμμένος λογαριασμός", author=None)
        Question.objects.filter(author=profile).update(pseudonym="Διαγραμμένος λογαριασμός", author=None)
        user = request.user
        from django.contrib.auth import logout

        logout(request)
        user.delete()  # διαγράφει και το προφίλ και τις προτάσεις του
        messages.success(request, "Ο λογαριασμός και τα προσωπικά σας στοιχεία διαγράφηκαν. Τα σχόλιά σας παραμένουν χωρίς όνομα.")
        return redirect("home")
    messages.error(request, "Λάθος κωδικός. Ο λογαριασμός δεν διαγράφηκε.")
    return redirect("citizen_account")


def privacy(request):
    return render(request, "core/privacy.html")


# ------------------------------------------------------------ προτάσεις πολιτών


def _need_proposals(request):
    if not (features.enabled(request, "citizen_proposals") and features.enabled(request, "citizen_accounts")):
        raise Http404


@verified_required
def proposal_new(request, slug):
    _need_proposals(request)
    topic = get_object_or_404(Topic, slug=slug)
    existing = CitizenProposal.objects.filter(author=request.citizen, topic=topic).first()
    if existing:
        messages.error(request, "Έχετε ήδη υποβάλει πρόταση σε αυτό το θέμα. Διαγράψτε την πρώτα αν θέλετε να την αντικαταστήσετε.")
        return redirect("citizen_proposal", pk=existing.pk)
    form = CitizenProposalForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        from .views import LINK_RE

        text = " ".join(str(form.cleaned_data[f]) for f in form.fields if f != "source")
        ok, msg = ratelimit.allowed(request)
        if LINK_RE.search(text):
            form.add_error(None, "Στα κείμενα δεν επιτρέπονται σύνδεσμοι. Βάλτε τον σύνδεσμο μόνο στο πεδίο πηγής.")
        elif not ok:
            form.add_error(None, msg)
        else:
            ratelimit.record(request)
            obj = form.save(commit=False)
            obj.author, obj.topic = request.citizen, topic
            obj.save()
            messages.success(request, "Η πρότασή σας δημοσιεύτηκε.")
            return redirect("citizen_proposal", pk=obj.pk)
    return render(request, "core/citizen_proposal_form.html", {"form": form, "topic": topic})


def proposal_detail(request, pk):
    _need_proposals(request)
    prop = get_object_or_404(CitizenProposal.objects.select_related("author", "topic"), pk=pk, removed=False)
    mine = citizen_of(request)
    return render(request, "core/citizen_proposal.html", {"p": prop, "is_author": bool(mine and mine.pk == prop.author_id)})


@require_POST
def proposal_report(request, pk):
    _need_proposals(request)
    prop = get_object_or_404(CitizenProposal, pk=pk, removed=False)
    ok, msg = ratelimit.check_and_record(request)
    if ok:
        CitizenProposal.objects.filter(pk=pk).update(report_count=prop.report_count + 1)
        messages.success(request, "Η αναφορά καταγράφηκε και θα εξεταστεί.")
    else:
        messages.error(request, msg)
    return redirect("citizen_proposal", pk=pk)


@require_POST
@citizen_required
def proposal_delete(request, pk):
    prop = get_object_or_404(CitizenProposal, pk=pk, author=request.citizen)
    topic = prop.topic
    prop.delete()
    messages.success(request, "Η πρότασή σας διαγράφηκε.")
    return redirect("topic", slug=topic.slug)
