import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env');
const fileEnv = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !match[2].startsWith('#')) {
      fileEnv[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const supabaseUrl = (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL)?.trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ??
  fileEnv.SUPABASE_SERVICE_KEY
)?.trim();
const password = process.env.WATCH_ADMIN_PASSWORD ?? fileEnv.WATCH_ADMIN_PASSWORD;
const email = 'watchadmin@gmail.com';

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), and WATCH_ADMIN_PASSWORD.',
  );
}
if (password.length < 12) {
  throw new Error('WATCH_ADMIN_PASSWORD must be at least 12 characters.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let adminUser;
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) throw new Error(`Unable to find admin account: ${error.message}`);
  adminUser = data.users.find(
    (user) => user.email?.toLowerCase() === email,
  );
  if (adminUser || data.users.length < 1000) break;
}

if (adminUser) {
  const { data, error } = await supabase.auth.admin.updateUserById(
    adminUser.id,
    { password, email_confirm: true },
  );
  if (error) throw new Error(`Unable to update admin account: ${error.message}`);
  adminUser = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'W.A.T.C.H. Admin' },
  });
  if (error) throw new Error(`Unable to create admin account: ${error.message}`);
  adminUser = data.user;
}

if (!adminUser) throw new Error('Supabase did not return the admin user.');
const { error } = await supabase.from('user_info').upsert(
  {
    id: adminUser.id,
    email,
    name: 'W.A.T.C.H. Admin',
    role: 'admin',
  },
  { onConflict: 'id' },
);
if (error) throw new Error(`Unable to assign admin role: ${error.message}`);

console.log(`Admin account ${email} is ready.`);
