from django.urls import path

from django.contrib.auth import views as auth_views
from django.urls import reverse_lazy

from . import account_views, citizens, views

urlpatterns = [
    path("", views.home, name="home"),
    path("kommata/", views.catalog, name="catalog"),
    path("kommata/<str:slug>/", views.party_detail, name="party"),
    path("themata/", views.topics_index, name="topics"),
    path("thema/<str:slug>/", views.topic_detail, name="topic"),
    path("protasi/<int:pk>/", views.proposal_detail, name="proposal"),
    path("erotima/<int:pk>/", views.question_detail, name="question"),
    path("sygkrisi/", views.compare, name="compare"),
    path("erotimatologio/", views.questionnaire, name="questionnaire"),
    path("health/", views.health, name="health"),
    path("aitisi/", views.apply_view, name="apply"),
    # Λογαριασμοί πολιτών και προτάσεις πολιτών
    path("logariasmos/eggrafi/", citizens.register, name="citizen_register"),
    path("logariasmos/eisodos/", citizens.citizen_login, name="citizen_login"),
    path("logariasmos/", citizens.account, name="citizen_account"),
    path("logariasmos/epivevaiosi/<str:token>/", citizens.verify, name="citizen_verify"),
    path("logariasmos/nea-epivevaiosi/", citizens.resend, name="citizen_resend"),
    path("logariasmos/diagrafi/", citizens.delete_account, name="citizen_delete"),
    path("logariasmos/kodikos/", auth_views.PasswordResetView.as_view(template_name="core/citizen_pw_reset.html", email_template_name="core/email/pw_reset.txt", subject_template_name="core/email/pw_reset_subject.txt", success_url=reverse_lazy("citizen_pw_reset_done")), name="citizen_pw_reset"),
    path("logariasmos/kodikos/stalthike/", auth_views.PasswordResetDoneView.as_view(template_name="core/citizen_pw_reset_done.html"), name="citizen_pw_reset_done"),
    path("logariasmos/kodikos/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(template_name="core/citizen_pw_reset_confirm.html", success_url=reverse_lazy("citizen_pw_reset_complete")), name="citizen_pw_reset_confirm"),
    path("logariasmos/kodikos/oloklirothike/", auth_views.PasswordResetCompleteView.as_view(template_name="core/citizen_pw_reset_complete.html"), name="citizen_pw_reset_complete"),
    path("aporrito/", citizens.privacy, name="privacy"),
    path("thema/<str:slug>/politis/nea/", citizens.proposal_new, name="citizen_proposal_new"),
    path("politis-protasi/<int:pk>/", citizens.proposal_detail, name="citizen_proposal"),
    path("politis-protasi/<int:pk>/anafora/", citizens.proposal_report, name="citizen_proposal_report"),
    path("politis-protasi/<int:pk>/diagrafi/", citizens.proposal_delete, name="citizen_proposal_delete"),
    path("kanones/", views.rules, name="rules"),
    path("diafaneia/", views.transparency, name="transparency"),
    path("sxolio/<int:pk>/anafora/", views.report_comment, name="report_comment"),
    path("sxolio/<int:pk>/afairesi/", views.staff_remove_comment, name="staff_remove_comment"),
    path("sxolio/<int:pk>/diagrafi/", views.delete_comment, name="delete_comment"),
    # Λογαριασμοί κομμάτων
    path("eisodos/", account_views.login_view, name="login"),
    path("eisodos/2fa/", account_views.totp_view, name="totp"),
    path("exodos/", account_views.logout_view, name="logout"),
    path("komma/", account_views.manage_home, name="manage"),
    path("komma/profil/", account_views.profile_edit, name="profile_edit"),
    path("komma/binteo/", account_views.videos_edit, name="videos_edit"),
    path("komma/prosopa/", account_views.people_edit, name="people_edit"),
    path("komma/protasi/nea/", account_views.proposal_edit, name="proposal_new"),
    path("komma/protasi/<int:pk>/", account_views.proposal_edit, name="proposal_edit"),
    path(
        "komma/kodikos/",
        auth_views.PasswordChangeView.as_view(
            template_name="core/password_change.html", success_url=reverse_lazy("manage")
        ),
        name="password_change",
    ),
    path("apantisi/<str:kind>/<int:pk>/", account_views.official_reply, name="official_reply"),
]
