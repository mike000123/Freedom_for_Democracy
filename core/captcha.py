"""Απλό captcha-πρόχειρο (πρόσθεση) για το πρωτότυπο.

Σε παραγωγή αντικαθίσταται από πάροχο συμβατό με GDPR (π.χ. αυτο-φιλοξενούμενο
ή χωρίς tracking). Η διεπαφή (new_challenge / verify) μένει ίδια.
"""
import random


def new_challenge(request):
    a, b = random.randint(2, 9), random.randint(2, 9)
    request.session["captcha_answer"] = a + b
    return f"{a} + {b}"


def verify(request, value):
    expected = request.session.pop("captcha_answer", None)
    try:
        return expected is not None and int(str(value).strip()) == expected
    except ValueError:
        return False
