from django.db import migrations


def enable(apps, schema_editor):
    FeatureFlag = apps.get_model("core", "FeatureFlag")
    FeatureFlag.objects.filter(key="comparison", state="off").update(state="on")


class Migration(migrations.Migration):
    dependencies = [("core", "0009_party_videos")]
    operations = [migrations.RunPython(enable, migrations.RunPython.noop)]
