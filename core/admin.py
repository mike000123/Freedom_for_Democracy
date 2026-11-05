"""Πάνελ διαχείρισης: έλεγχος κομμάτων, προτάσεων, σχολίων.

Κάθε δημοσίευση, αφαίρεση ή αλλαγή κατάστασης καταγράφεται αυτόματα στο
δημόσιο αρχείο αποφάσεων (Decision) με την αιτιολόγηση του πεδίου «moderation_note».
"""
from django.contrib import admin

from django.utils import timezone

from . import features
from .models import ChangeLogEntry, CitizenProfile, CitizenProposal, Comment, Decision, FeatureChange, FeatureFlag, Impression, Party, PartyApplication, PartyMember, Proposal, Question, Topic, TotpDevice


def log(subject, decision, reason):
    Decision.objects.create(
        subject=subject,
        decision=decision,
        reason=reason or "Δεν δόθηκε αιτιολόγηση (συμπληρώστε το πεδίο στη διαχείριση).",
    )


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "tier", "is_published", "graduated", "is_example", "created_at")
    list_filter = ("kind", "tier", "is_published", "graduated")
    search_fields = ("name", "founders")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if "is_published" in form.changed_data:
            if obj.is_published:
                log(obj.name, Decision.ACCEPTED, obj.moderation_note or "Ολοκληρώθηκε ο έλεγχος των προϋποθέσεων εγγραφής.")
            else:
                log(obj.name, Decision.REMOVED, obj.moderation_note)
        if "graduated" in form.changed_data and obj.graduated:
            log(obj.name, Decision.REMOVED, obj.moderation_note or "Το κόμμα εισήλθε στη Βουλή και βγαίνει από την ισότιμη εναλλαγή.")


@admin.register(Proposal)
class ProposalAdmin(admin.ModelAdmin):
    list_display = ("title", "party", "topic", "is_published", "updated_at")
    list_filter = ("topic", "is_published")
    search_fields = ("title", "party__name")


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("body", "topic", "pseudonym", "removed", "created_at")
    list_filter = ("topic", "removed")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if "removed" in form.changed_data and obj.removed:
            log(f"Ερώτημα #{obj.pk}", Decision.REMOVED, obj.moderation_note)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "kind", "removed", "report_count", "official_party", "created_at")
    list_filter = ("kind", "removed")
    search_fields = ("body", "pseudonym")
    ordering = ("-report_count", "-created_at")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if "removed" in form.changed_data and obj.removed and not obj.removed_by_author:
            log(f"Σχόλιο #{obj.pk}", Decision.REMOVED, obj.moderation_note)


@admin.register(Decision)
class DecisionAdmin(admin.ModelAdmin):
    list_display = ("decided_at", "decision", "subject")
    list_filter = ("decision",)


@admin.register(PartyMember)
class PartyMemberAdmin(admin.ModelAdmin):
    """Λογαριασμοί εκπροσώπων. Δημιουργήστε πρώτα τον χρήστη (username = email) και μετά τη σύνδεση εδώ,
    ή χρησιμοποιήστε `python manage.py invite_member`."""

    list_display = ("user", "party")
    actions = ["reset_2fa"]

    @admin.action(description="Επαναφορά δεύτερου παράγοντα (νέο κλειδί στην επόμενη είσοδο)")
    def reset_2fa(self, request, queryset):
        TotpDevice.objects.filter(user__in=[m.user for m in queryset]).delete()


admin.site.register(ChangeLogEntry)
admin.site.register(Topic)
admin.site.register(Impression)


@admin.register(PartyApplication)
class PartyApplicationAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "state", "contact_email", "created_at")
    list_filter = ("state", "kind")
    search_fields = ("name", "contact_email")
    readonly_fields = ("party", "created_at")
    actions = ["approve", "ask_changes", "reject"]

    @admin.action(description="Έγκριση: δημιουργία μη δημοσιευμένου προφίλ και λογαριασμού εκπροσώπου")
    def approve(self, request, queryset):
        import secrets

        from django.contrib.auth import get_user_model

        User = get_user_model()
        for app in queryset.filter(state__in=[PartyApplication.PENDING, PartyApplication.CHANGES], party__isnull=True):
            if Party.objects.filter(name__iexact=app.name).exists() or User.objects.filter(username=app.contact_email).exists():
                self.message_user(request, f"«{app.name}»: υπάρχει ήδη κόμμα ή χρήστης με αυτά τα στοιχεία.", level="error")
                continue
            party = Party.objects.create(
                name=app.name, kind=app.kind, responsible_persons=app.responsible_persons,
                website=app.website, is_published=False,
            )
            temp = secrets.token_urlsafe(9)
            user = User.objects.create_user(app.contact_email, app.contact_email, temp)
            PartyMember.objects.create(user=user, party=party)
            app.party, app.state = party, PartyApplication.APPROVED
            app.save()
            self.message_user(
                request,
                f"«{app.name}»: δημιουργήθηκε μη δημοσιευμένο προφίλ. Προσωρινός κωδικός για {app.contact_email}: {temp} "
                "(στείλτε τον με ασφαλή τρόπο· θα ζητηθεί αλλαγή και ρύθμιση 2FA).",
            )

    @admin.action(description="Ζητήθηκαν διευκρινίσεις")
    def ask_changes(self, request, queryset):
        queryset.filter(state=PartyApplication.PENDING).update(state=PartyApplication.CHANGES)

    @admin.action(description="Απόρριψη")
    def reject(self, request, queryset):
        queryset.exclude(state=PartyApplication.APPROVED).update(state=PartyApplication.REJECTED)


class FeatureChangeInline(admin.TabularInline):
    model = FeatureChange
    extra = 0
    can_delete = False
    readonly_fields = ("at", "old_state", "new_state", "version", "by")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ("label", "key", "state", "version", "updated_at")
    list_editable = ("state",)
    readonly_fields = ("key", "label", "description", "version", "updated_at")
    inlines = [FeatureChangeInline]

    def get_queryset(self, request):
        features.ensure_flags()
        return super().get_queryset(request)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        old = FeatureFlag.objects.filter(pk=obj.pk).values_list("state", flat=True).first()
        if old is not None and old != obj.state:
            obj.version += 1
            obj.updated_at = timezone.now()
            super().save_model(request, obj, form, change)
            FeatureChange.objects.create(flag=obj, old_state=old, new_state=obj.state, version=obj.version, by=request.user.get_username())
        else:
            super().save_model(request, obj, form, change)


@admin.register(CitizenProfile)
class CitizenProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "kind", "org_type", "verified_at", "created_at")
    list_filter = ("kind", "org_type")
    search_fields = ("display_name", "user__email", "contact_person")
    readonly_fields = ("user", "consent_at", "verified_at", "created_at")


@admin.register(CitizenProposal)
class CitizenProposalAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "topic", "removed", "report_count", "created_at")
    list_filter = ("removed", "topic")
    search_fields = ("title", "author__display_name")
    ordering = ("-report_count", "-created_at")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if "removed" in form.changed_data and obj.removed:
            log(f"Πρόταση πολίτη #{obj.pk}", Decision.REMOVED, obj.moderation_note)
