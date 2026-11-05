"""TOTP (RFC 6238) με τη βιβλιοθήκη της Python, χωρίς εξωτερικές εξαρτήσεις.

Συμβατό με Google Authenticator, Microsoft Authenticator, Aegis, 1Password κ.ά.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP = 30


def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret, counter):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 10**6:06d}"


def code_now(secret, now=None):
    now = time.time() if now is None else now
    return _hotp(secret, int(now // STEP))


def verify(secret, code, last_counter=0, now=None, window=1):
    """Επιστρέφει τον μετρητή που ταιριάζει ή None.

    Ο μετρητής πρέπει να είναι μεγαλύτερος από τον τελευταίο που χρησιμοποιήθηκε,
    ώστε ένας κωδικός να μην μπορεί να ξαναχρησιμοποιηθεί (αποτροπή επανάληψης).
    """
    now = time.time() if now is None else now
    code = (code or "").strip().replace(" ", "")
    if len(code) != 6 or not code.isdigit():
        return None
    current = int(now // STEP)
    for counter in range(current - window, current + window + 1):
        if counter > last_counter and hmac.compare_digest(_hotp(secret, counter), code):
            return counter
    return None


def uri(secret, account, issuer="Freedom for Democracy"):
    return f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret}&issuer={quote(issuer)}"


def grouped(secret):
    return " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))
