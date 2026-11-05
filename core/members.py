from functools import wraps

from django.shortcuts import redirect


def member_party(request):
    """Το κόμμα του συνδεδεμένου εκπροσώπου ή None."""
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None
    membership = getattr(user, "membership", None)
    return membership.party if membership else None


def member_required(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        party = member_party(request)
        if party is None:
            return redirect("login")
        request.member_party = party
        return view(request, *args, **kwargs)

    return wrapper
