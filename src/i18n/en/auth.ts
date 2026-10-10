import type { Dict } from '../types';

export default {
  brand: { title: 'One link, for your whole presence.', text: 'Bring your identity, socials, services and contacts together on a page that looks like you.', example: 'Fictional example' },
  fields: { name: 'Full name', email: 'Email address', password: 'Password', newPassword: 'New password', confirmPassword: 'Confirm password', showPassword: 'Show password', hidePassword: 'Hide password' },
  errors: {
    invalidCredentials: 'Incorrect email or password.',
    suspended: 'This account is suspended. Please contact support.',
    emailTaken: 'An account already exists with this email.',
    network: 'Unable to connect right now. Check your network and try again.',
    generic: 'Something went wrong. Please try again shortly.',
    passwordMismatch: 'Passwords do not match.',
    termsRequired: 'You must accept the terms to create an account.',
  },
  demo: { title: 'Demo mode', text: 'No server is connected. No password is checked or stored: use a sample account below or create your own.', accounts: 'Sample accounts', use: 'Use' },
  login: { title: 'Welcome back', subtitle: 'Sign in to manage your digital presence.', submit: 'Sign in', forgot: 'Forgot your password?', noAccount: 'No account yet?', register: 'Create my 1Link' },
  register: { title: 'Create your 1Link', subtitle: 'Free to start. You will pick your category in the next step.', submit: 'Create my account', haveAccount: 'Already have an account?', login: 'Sign in', passwordHint: 'At least 8 characters.' },
  forgot: { title: 'Forgot password', subtitle: 'Enter your email and we will send you a reset link.', submit: 'Send link', back: 'Back to sign in' },
  signOut: { title: 'Sign out?', confirm: 'Sign out', cancel: 'Stay signed in' },
  signedOut: { title: 'You are signed out', login: 'Sign in again', home: 'Back to home' },
  expired: { title: 'Session expired', login: 'Sign in again' },
} satisfies Dict;
