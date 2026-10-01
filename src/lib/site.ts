export const ownerName = 'Yiorgos Papadopoulos';

export const skipLink = {
  label: 'Skip to main content',
  target: 'main',
} as const;

export const links = {
  linkedin: 'https://www.linkedin.com/in/yiorgospapadopoulos/',
  github: 'https://github.com/yiorgospapadopoulos',
  email: 'giorgospapadopoulos002@yahoo.com',
} as const;

const emailPattern = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function mailto(address: string): string {
  if (!emailPattern.test(address)) {
    throw new Error(`Invalid email address: ${address}`);
  }
  return `mailto:${address}`;
}
