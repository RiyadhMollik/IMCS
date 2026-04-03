from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0003_conversationparticipant_hidden_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationparticipant",
            name="is_locked",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conversationparticipant",
            name="locked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
