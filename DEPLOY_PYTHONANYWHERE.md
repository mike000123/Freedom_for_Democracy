# Δημοσίευση στο PythonAnywhere (δωρεάν πλάνο)

Αντικατάστησε το `ΟΝΟΜΑ` με το όνομα χρήστη σου στο PythonAnywhere.

## 1. Κώδικας
Στο **Consoles → Bash**:
```bash
git clone https://github.com/ΧΡΗΣΤΗΣ/ΑΠΟΘΕΤΗΡΙΟ.git freedom
cd freedom
python3.12 -m venv ~/venv-freedom
source ~/venv-freedom/bin/activate
pip install -r requirements.txt
```

## 2. Μυστικά και ρυθμίσεις
Φτιάξε το αρχείο `~/freedom/.env.sh` (δεν ανεβαίνει στο GitHub) με:
```bash
export FD_DEBUG=0
export FD_SECRET_KEY="βάλε-μακρύ-τυχαίο-κείμενο"
export FD_IP_HASH_KEY="άλλο-μακρύ-τυχαίο-κείμενο"
export FD_ALLOWED_HOSTS="ΟΝΟΜΑ.pythonanywhere.com"
export FD_CSRF_ORIGINS="https://ΟΝΟΜΑ.pythonanywhere.com"
export FD_DEMO_BANNER=1
export FD_ADMIN_PASSWORD="δικός-σου-ισχυρός-κωδικός"
```
Τυχαίο κλειδί: `python -c "import secrets; print(secrets.token_urlsafe(50))"`.

## 3. Βάση και δεδομένα δείγματος
```bash
source ~/venv-freedom/bin/activate
source ~/freedom/.env.sh
cd ~/freedom
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py seed_demo --if-empty
python manage.py seed_showcase
python manage.py ensure_admin
```

## 4. Web app
Στο **Web → Add a new web app → Manual configuration → Python 3.12**.

- **Source code:** `/home/ΟΝΟΜΑ/freedom`
- **Virtualenv:** `/home/ΟΝΟΜΑ/venv-freedom`
- **Static files:**
  - URL `/static/` → `/home/ΟΝΟΜΑ/freedom/staticfiles`
  - URL `/media/` → `/home/ΟΝΟΜΑ/freedom/media`
- **WSGI file** (κλικ στον σύνδεσμο): σβήσε το περιεχόμενο και βάλε
```python
import os, sys
path = "/home/ΟΝΟΜΑ/freedom"
if path not in sys.path:
    sys.path.insert(0, path)
os.environ["FD_DEBUG"] = "0"
os.environ["FD_SECRET_KEY"] = "το-ίδιο-με-το-.env.sh"
os.environ["FD_IP_HASH_KEY"] = "το-ίδιο-με-το-.env.sh"
os.environ["FD_ALLOWED_HOSTS"] = "ΟΝΟΜΑ.pythonanywhere.com"
os.environ["FD_CSRF_ORIGINS"] = "https://ΟΝΟΜΑ.pythonanywhere.com"
os.environ["FD_DEMO_BANNER"] = "1"
os.environ["DJANGO_SETTINGS_MODULE"] = "fd_site.settings"
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
```
Πάτα **Reload**. Το site ανοίγει στο `https://ΟΝΟΜΑ.pythonanywhere.com`.

## Ενημέρωση μετά από αλλαγές
```bash
cd ~/freedom && git pull
source ~/venv-freedom/bin/activate && source .env.sh
python manage.py migrate && python manage.py collectstatic --noinput
```
Μετά **Reload** στο Web.

## Προσοχή
- Με `FD_DEBUG=0` οι λογαριασμοί δείγματος δεν έχουν κωδικό: οι επισκέπτες βλέπουν το site, αλλά δεν συνδέονται με αυτούς.
- Δεν στέλνονται email επιβεβαίωσης, γιατί δεν υπάρχει SMTP. Νέοι πολίτες δεν θα ολοκληρώνουν εγγραφή μέχρι να ρυθμιστεί (`FD_EMAIL_BACKEND` και `EMAIL_HOST*`).
- Το δωρεάν πλάνο χρειάζεται ανανέωση κάθε 3 μήνες (κουμπί στο Web).
- Η σελίδα απορρήτου είναι προσχέδιο και θέλει νομικό έλεγχο πριν δημόσια χρήση.
