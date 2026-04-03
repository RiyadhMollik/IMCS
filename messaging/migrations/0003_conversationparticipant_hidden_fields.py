from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0002_message_features_upgrade"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationparticipant",
            name="is_hidden",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conversationparticipant",
            name="hidden_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
