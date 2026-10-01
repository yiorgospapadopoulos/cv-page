import type { FooterLinkKey, Profile, ProfileLinks } from '../content/types';
import { mailto } from './site';

export type FooterPart =
  | { kind: 'text'; text: string }
  | {
      kind: 'link';
      link: FooterLinkKey;
      label: string;
      href: string;
      external: boolean;
    };

function resolve(
  link: FooterLinkKey,
  urls: ProfileLinks,
): { href: string; external: boolean } {
  switch (link) {
    case 'linkedin':
      return { href: urls.linkedinUrl, external: true };
    case 'github':
      return { href: urls.githubUrl, external: true };
    case 'email':
      return { href: mailto(urls.email), external: false };
  }
}

export function footerParts(profile: Profile): FooterPart[] {
  return profile.footer.segments.map((segment) =>
    segment.kind === 'text'
      ? segment
      : { ...segment, ...resolve(segment.link, profile.links) },
  );
}
