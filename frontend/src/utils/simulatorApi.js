import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:9999/apfsconnect/api',
});

export const simApi = {
  getContacts: () => api.get('/simulator/contacts').then(r => r.data.data || []),
  addContact: (phone, name) => api.post('/simulator/contacts', { phone, name }).then(r => r.data.data),
  deleteContact: (phone) => api.delete(`/simulator/contacts/${phone}`),

  getMessages: (phone, since = 0) =>
    api.get(`/simulator/messages/${phone}`, { params: { since } }).then(r => r.data.data),
  clearMessages: (phone) => api.delete(`/simulator/messages/${phone}`),

  sendText: (phone, message) =>
    api.post('/simulator/send', { phone, type: 'text', message }),
  sendButtonReply: (phone, button_id, button_title) =>
    api.post('/simulator/send', { phone, type: 'button_reply', button_id, button_title }),
  sendListReply: (phone, reply_id, reply_title) =>
    api.post('/simulator/send', { phone, type: 'list_reply', reply_id, reply_title }),
  sendImage: (phone, url, caption = '') =>
    api.post('/simulator/send', { phone, type: 'image', url, caption }),
};
