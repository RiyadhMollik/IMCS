from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0001_initial'),
        ('calls', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='conferencecall',
            name='conversation',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='conference_calls',
                to='messaging.conversation',
            ),
        ),
    ]
