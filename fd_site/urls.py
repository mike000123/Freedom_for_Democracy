from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Freedom for Democracy – διαχείριση"
admin.site.site_title = "Freedom for Democracy"

from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("core.urls")),
]

if settings.DEBUG:  # τοπική εξυπηρέτηση εικόνων· στην παραγωγή τα σερβίρει ο web server
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
