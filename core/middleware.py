"""Κεφαλίδες ασφαλείας. Η πολιτική περιεχομένου (CSP) δεν επιτρέπει εξωτερικούς πόρους
ούτε inline στυλ/σενάρια, άρα δεν υπάρχουν εξωτερικοί ιχνηλάτες ή γραμματοσειρές.
Η διαχείριση Django (/admin/) εξαιρείται γιατί χρησιμοποιεί δικά της inline στοιχεία."""

CSP = (
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; "
    "frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if not request.path.startswith("/admin/"):
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response
