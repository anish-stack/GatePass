import { asyncHandler } from '../utils/httpError.js';
import * as auth from '../services/auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { role, username, password } = req.body || {};
  res.json(await auth.login({ role, username, password }));
});

export const me = asyncHandler(async (req, res) => {
  res.json({ session: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await auth.changeAdminPassword(req.user.id, req.body?.currentPassword, req.body?.newPassword);
  res.json({ success: true, message: 'Password updated successfully.' });
});
