from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationparticipant",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conversationparticipant",
            name="pinned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="mentioned_users",
            field=models.ManyToManyField(blank=True, related_name="mentioned_in_messages", to=settings.AUTH_USER_MODEL),
        ),
        migrations.CreateModel(
            name="MessageEditHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("previous_content", models.TextField(blank=True)),
                ("edited_at", models.DateTimeField(auto_now_add=True)),
                (
                    "edited_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="message_edits", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "message",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="edit_history", to="messaging.message"),
                ),
            ],
            options={
                "db_table": "message_edit_history",
                "ordering": ["-edited_at"],
                "indexes": [models.Index(fields=["message", "-edited_at"], name="message_edi_message_e91754_idx")],
            },
        ),
        migrations.CreateModel(
            name="MessagePoll",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question", models.CharField(max_length=300)),
                ("allows_multiple", models.BooleanField(default=False)),
                ("closes_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "message",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="poll", to="messaging.message"),
                ),
            ],
            options={"db_table": "message_polls"},
        ),
        migrations.CreateModel(
            name="MessagePollOption",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.CharField(max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "poll",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="options", to="messaging.messagepoll"),
                ),
            ],
            options={"db_table": "message_poll_options", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="MessagePollVote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("voted_at", models.DateTimeField(auto_now=True)),
                (
                    "option",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="votes", to="messaging.messagepolloption"),
                ),
                (
                    "poll",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="votes", to="messaging.messagepoll"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="poll_votes", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "db_table": "message_poll_votes",
                "indexes": [
                    models.Index(fields=["poll", "user"], name="message_pol_poll_id_33f12d_idx"),
                    models.Index(fields=["option"], name="message_pol_option__8d4493_idx"),
                ],
                "unique_together": {("poll", "option", "user")},
            },
        ),
    ]
