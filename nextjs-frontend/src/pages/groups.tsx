import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

interface UserItem {
  id: number;
  username: string;
}

interface ConversationGroup {
  id: number;
  name: string;
  conversation_type: string;
  participants: UserItem[];
}

interface ConferenceGroup {
  id: number;
  title: string;
  room_id: string;
  call_type: 'audio' | 'video';
  participant_count: number;
  status: string;
}

export default function GroupsPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [messageGroups, setMessageGroups] = useState<ConversationGroup[]>([]);
  const [conferenceGroups, setConferenceGroups] = useState<ConferenceGroup[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [conferenceTitle, setConferenceTitle] = useState('');
  const [conferenceCallType, setConferenceCallType] = useState<'audio' | 'video'>('video');
  const [savingMessageGroup, setSavingMessageGroup] = useState(false);
  const [savingConferenceGroup, setSavingConferenceGroup] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    try {
      const [usersResponse, conversationsResponse, conferenceResponse] = await Promise.all([
        api.get('/users/'),
        api.get('/conversations/'),
        api.get('/conference-calls/'),
      ]);

      const usersData = usersResponse.data.results || usersResponse.data;
      const conversationsData = conversationsResponse.data.results || conversationsResponse.data;
      const conferencesData = conferenceResponse.data.results || conferenceResponse.data;

      setUsers(usersData);
      setMessageGroups(
        conversationsData.filter((conversation: ConversationGroup) => conversation.conversation_type === 'group')
      );
      setConferenceGroups(conferencesData);
    } catch (error) {
      console.error('Failed to load groups data:', error);
    }
  };

  const toggleUser = (userId: number) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const createMessageGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedUsers.length === 0) {
      alert('Group name and at least one member are required.');
      return;
    }

    try {
      setSavingMessageGroup(true);
      await api.post('/conversations/', {
        conversation_type: 'group',
        name: groupName,
        participant_ids: selectedUsers,
      });
      setGroupName('');
      setSelectedUsers([]);
      await loadData();
      alert('Message group created successfully.');
    } catch (error) {
      console.error('Failed to create message group:', error);
      alert('Failed to create message group.');
    } finally {
      setSavingMessageGroup(false);
    }
  };

  const createConferenceGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUsers.length === 0) {
      alert('At least one participant is required for group call.');
      return;
    }

    try {
      setSavingConferenceGroup(true);
      await api.post('/conference-calls/', {
        title: conferenceTitle,
        call_type: conferenceCallType,
        participant_ids: selectedUsers,
      });
      setConferenceTitle('');
      setSelectedUsers([]);
      await loadData();
      alert('Group call created successfully.');
    } catch (error) {
      console.error('Failed to create conference group:', error);
      alert('Failed to create group call.');
    } finally {
      setSavingConferenceGroup(false);
    }
  };

  if (loading || !isAuthenticated) {
    return <div className="secure-screen flex items-center justify-center text-slate-300">Loading...</div>;
  }

  return (
    <div className="secure-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold secure-title">Groups</h1>
          <button
            onClick={() => router.push('/dashboard')}
            className="secure-btn-secondary"
          >
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <form onSubmit={createMessageGroup} className="secure-panel p-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Create Message Group</h2>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="secure-input mb-3"
            />
            <button
              type="submit"
              disabled={savingMessageGroup}
              className="secure-btn w-full disabled:opacity-60"
            >
              {savingMessageGroup ? 'Creating...' : 'Create Message Group'}
            </button>
          </form>

          <form onSubmit={createConferenceGroup} className="secure-panel p-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Create Group Call</h2>
            <input
              type="text"
              value={conferenceTitle}
              onChange={(e) => setConferenceTitle(e.target.value)}
              placeholder="Call title (optional)"
              className="secure-input mb-3"
            />
            <select
              value={conferenceCallType}
              onChange={(e) => setConferenceCallType(e.target.value as 'audio' | 'video')}
              className="secure-select mb-3"
            >
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
            <button
              type="submit"
              disabled={savingConferenceGroup}
              className="secure-btn w-full disabled:opacity-60"
            >
              {savingConferenceGroup ? 'Creating...' : 'Create Group Call'}
            </button>
          </form>
        </div>

        <div className="secure-panel p-5 mb-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-3">Select Group Members</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {users.map((user) => (
              <label key={user.id} className="flex items-center space-x-2 border border-cyan-200/20 rounded-xl bg-cyan-500/5 px-3 py-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />
                <span>{user.username}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="secure-panel p-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Message Groups</h2>
            {messageGroups.length === 0 ? (
              <p className="text-slate-400">No message groups yet.</p>
            ) : (
              <div className="space-y-3">
                {messageGroups.map((group) => (
                  <div key={group.id} className="border border-cyan-200/20 rounded-xl bg-cyan-500/5 p-3">
                    <div className="font-semibold text-slate-100">{group.name || `Group ${group.id}`}</div>
                    <div className="text-sm text-slate-400">Members: {group.participants?.length || 0}</div>
                    <button
                      onClick={() => router.push(`/messages?conversation=${group.id}`)}
                      className="mt-2 text-sm secure-btn-secondary px-3 py-1"
                    >
                      Open Messages
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="secure-panel p-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Group Calls</h2>
            {conferenceGroups.length === 0 ? (
              <p className="text-slate-400">No group calls yet.</p>
            ) : (
              <div className="space-y-3">
                {conferenceGroups.map((call) => (
                  <div key={call.id} className="border border-cyan-200/20 rounded-xl bg-cyan-500/5 p-3">
                    <div className="font-semibold text-slate-100">{call.title || `Conference ${call.id}`}</div>
                    <div className="text-sm text-slate-400">
                      {call.call_type.toUpperCase()} • Participants: {call.participant_count} • {call.status}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/conference-calls/${call.id}/join/`);
                          router.push(`/calls?conference=${call.id}`);
                        } catch (error) {
                          console.error('Failed to join conference call:', error);
                          alert('Failed to join conference call');
                        }
                      }}
                      className="mt-2 text-sm secure-btn-secondary px-3 py-1"
                    >
                      Open Group Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
