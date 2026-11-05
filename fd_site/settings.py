"""Ρυθμίσεις του πρωτοτύπου Freedom for Democracy.

Όλες οι τιμές που αλλάζουν ανά περιβάλλον διαβάζονται από μεταβλητές FD_*.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("FD_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.environ.get("FD_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("FD_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "fd_site.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context.site",
            ],
        },
    },
]

WSGI_APPLICATION = "fd_site.wsgi.application"

if os.environ.get("FD_DB") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("FD_DB_NAME", "freedom"),
            "USER": os.environ.get("FD_DB_USER", "freedom"),
            "PASSWORD": os.environ.get("FD_DB_PASSWORD", ""),
            "HOST": os.environ.get("FD_DB_HOST", "localhost"),
            "PORT": os.environ.get("FD_DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

LANGUAGE_CODE = "el"
TIME_ZONE = "Europe/Athens"
USE_I18N = True
USE_TZ = True

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LOGIN_URL = "login"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Ασφάλεια σε παραγωγή ---
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    # Πίσω από reverse proxy (π.χ. PythonAnywhere): το HTTPS το τερματίζει ο proxy
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("FD_CSRF_ORIGINS", "").split(",") if o]

# --- Ρυθμίσεις πλατφόρμας ---
# Λογαριασμοί πολιτών δείγματος με γνωστό κωδικό (demo-politis-1). Από προεπιλογή μόνο τοπικά (DEBUG).
# Για δημόσια επίδειξη: FD_DEMO_LOGINS=1. Να μείνει κλειστό όταν υπάρχουν πραγματικοί χρήστες.
FD_DEMO_LOGINS = os.environ.get("FD_DEMO_LOGINS", "1" if DEBUG else "0") == "1"
FD_DEMO_BANNER = os.environ.get("FD_DEMO_BANNER", "1") == "1"
FD_HOME_SLOTS = 6        # κόμματα με πλήρες προφίλ στην κύρια εναλλαγή
FD_PROGRESS_SLOTS = 3    # εναλλαγή «Προφίλ σε εξέλιξη»
FD_GROUP_SLOTS = 3       # εναλλαγή «Ομάδες υπό σύσταση»

# Όρια ρυθμού υποβολής ανά διεύθυνση δικτύου (τιμές προς ρύθμιση)
FD_RATE_HOUR = 5
FD_RATE_DAY = 20
# Μυστικό κλειδί για τον κατακερματισμό IP. Πρέπει να αλλάξει σε παραγωγή.
FD_IP_HASH_KEY = os.environ.get("FD_IP_HASH_KEY", SECRET_KEY)
# Πόσες ώρες κρατιούνται τα κατακερματισμένα αναγνωριστικά ρυθμού (προς νομική επιβεβαίωση)
FD_IP_RETENTION_HOURS = 24

# Αποτυχημένες προσπάθειες εισόδου ανά ώρα, ανά διεύθυνση δικτύου
FD_LOGIN_RATE_HOUR = 10

# --- Email (επιβεβαίωση λογαριασμών, επαναφορά κωδικού) ---
# Τοπικά τυπώνεται στο αρχείο καταγραφής. Για παραγωγή: FD_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# και EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS από το περιβάλλον.
EMAIL_BACKEND = os.environ.get("FD_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "0") == "1"
DEFAULT_FROM_EMAIL = os.environ.get("FD_FROM_EMAIL", "Freedom for Democracy <no-reply@example.org>")
FD_VERIFY_MAX_AGE = 3 * 24 * 3600   # ισχύς συνδέσμου επιβεβαίωσης email
FD_REGISTER_RATE_HOUR = 3
FD_REGISTER_RATE_DAY = 10
