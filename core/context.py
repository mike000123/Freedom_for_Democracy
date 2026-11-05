from django.conf import settings

from . import features
from . import citizens
from .members import member_party


def site(request):
    return {"demo_banner": settings.FD_DEMO_BANNER, "member_party": member_party(request),
            "apply_enabled": features.enabled(request, "applications"),
            "citizen": citizens.citizen_of(request),
            "accounts_mode": features.enabled(request, "citizen_accounts"),
            "compare_enabled": features.enabled(request, "comparison"),
            "questionnaire_enabled": features.enabled(request, "questionnaire")}
