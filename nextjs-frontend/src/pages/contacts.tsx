import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import api from '@/lib/api';

interface Contact {
  id: number;
  username: string;
  email: string;
  is_online: boolean;
  online_status: string;
  profile_picture?: string;
  alias?: string;
  is_favorite?: boolean;
}

type UserListResponse = Contact[] | { results?: Contact[] };

export default function ContactsPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allUsers, setAllUsers] = useState<Contact[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { onlineUsers, connected } = useOnlineUsers();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchContacts();
      fetchAllUsers();
    }
  }, [isAuthenticated]);

  // Merge contacts with online status from WebSocket
  const contactsWithOnlineStatus = contacts.map(contact => {
    const onlineUser = onlineUsers.find(u => u.id === contact.id);
    return {
      ...contact,
      is_online: onlineUser ? onlineUser.is_online : false
    };
  });

  const fetchContacts = async () => {
    try {
      const response = await api.get('/users/contacts/');
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContacts([]);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await api.get<UserListResponse>('/users/');
      const payload = response.data;
      if (Array.isArray(payload)) {
        setAllUsers(payload);
      } else {
        setAllUsers(payload.results || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers([]);
    }
  };

  const addContact = async () => {
    if (!selectedUserId || addingContact) {
      return;
    }

    try {
      setAddingContact(true);
      await api.post('/users/add_contact/', {
        contact_id: Number(selectedUserId),
      });
      setSelectedUserId('');
      await fetchContacts();
    } catch (error) {
      console.error('Error adding contact:', error);
      alert('Failed to add contact. Please try again.');
    } finally {
      setAddingContact(false);
    }
  };

  const removeContact = async (contactId: number) => {
    try {
      await api.post('/users/remove_contact/', { contact_id: contactId });
      await fetchContacts();
    } catch (error) {
      console.error('Error removing contact:', error);
      alert('Failed to remove contact. Please try again.');
    }
  };

  const toggleFavorite = async (contactId: number) => {
    try {
      await api.post('/users/toggle_favorite_contact/', { contact_id: contactId });
      await fetchContacts();
    } catch (error) {
      console.error('Error toggling favorite:', error);
      alert('Failed to update favorite. Please try again.');
    }
  };

  const availableUsers = allUsers.filter(
    (candidate) =>
      candidate.id !== user?.id &&
      !contacts.some((contact) => contact.id === candidate.id)
  );

  const filteredContacts = contactsWithOnlineStatus.filter((contact) =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (contact.alias && contact.alias.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const favoriteContacts = filteredContacts.filter((contact) => contact.is_favorite);
  const regularContacts = filteredContacts.filter((contact) => !contact.is_favorite);

  const startMessage = (contact: Contact) => {
    router.push(`/messages?user=${contact.id}`);
  };

  const startCall = async (contact: Contact, type: 'audio' | 'video') => {
    // TODO: Implement call initiation
    alert(`Starting ${type} call with ${contact.username}`);
  };

  if (loading || !isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-800">My Contacts</h1>
              {connected && (
                <span className="ml-3 flex items-center text-xs text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
                  Live
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
          <div className="relative">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-3 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Add Contact */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Add Contact</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a user</option>
              {availableUsers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.username}
                </option>
              ))}
            </select>
            <button
              onClick={addContact}
              disabled={!selectedUserId || addingContact}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingContact ? 'Adding...' : 'Add'}
            </button>
          </div>
          {availableUsers.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">No available users to add right now.</p>
          )}
        </div>

        {/* Favorites */}
        {favoriteContacts.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-amber-200 mb-6">
            <div className="px-4 py-3 border-b border-amber-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-amber-700">Favorite Contacts</h2>
              <span className="text-xs text-amber-600">{favoriteContacts.length}</span>
            </div>
            <div className="divide-y divide-amber-100">
              {favoriteContacts.map((contact) => (
                <div key={`favorite-${contact.id}`} className="p-4 hover:bg-amber-50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {contact.username.charAt(0).toUpperCase()}
                        </div>
                        {contact.is_online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          {contact.alias || contact.username}
                        </div>
                        {contact.alias && (
                          <div className="text-xs text-gray-400">@{contact.username}</div>
                        )}
                        <div className="text-sm text-gray-500">
                          {contact.is_online ? (
                            <span className="text-green-600">● {contact.online_status}</span>
                          ) : (
                            <span className="text-gray-400">Offline</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startMessage(contact)}
                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition"
                        title="Send message"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startCall(contact, 'audio')}
                        className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                        title="Voice call"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startCall(contact, 'video')}
                        className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition"
                        title="Video call"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleFavorite(contact.id)}
                        className="p-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition"
                        title="Remove favorite"
                      >
                        ★
                      </button>
                      <button
                        onClick={() => removeContact(contact.id)}
                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                        title="Remove contact"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contacts List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {regularContacts.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-gray-500">No contacts found</p>
              <p className="text-sm text-gray-400 mt-2">Use the Add Contact box above to create your list</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {regularContacts.map((contact) => (
                <div key={contact.id} className="p-4 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {contact.username.charAt(0).toUpperCase()}
                        </div>
                        {contact.is_online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          {contact.alias || contact.username}
                        </div>
                        {contact.alias && (
                          <div className="text-xs text-gray-400">@{contact.username}</div>
                        )}
                        <div className="text-sm text-gray-500">
                          {contact.is_online ? (
                            <span className="text-green-600">● {contact.online_status}</span>
                          ) : (
                            <span className="text-gray-400">Offline</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startMessage(contact)}
                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition"
                        title="Send message"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startCall(contact, 'audio')}
                        className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                        title="Voice call"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startCall(contact, 'video')}
                        className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition"
                        title="Video call"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleFavorite(contact.id)}
                        className="p-2 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-200 transition"
                        title="Add to favorites"
                      >
                        ☆
                      </button>
                      <button
                        onClick={() => removeContact(contact.id)}
                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                        title="Remove contact"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
