import type { ImageSourcePropType } from 'react-native';

export type CustomAvatar = {
  id: string;
  source: ImageSourcePropType;
  /** Shown as "Art by …" when this avatar is selected. */
  credit: string;
};

/**
 * Artist credit for the avatar set. This line appears under the profile
 * circle on Edit Profile. Leave it blank until you have a name.
 */
export const AVATAR_ARTIST_CREDIT = 'karzs3';

/**
 * Custom avatars shown on Edit Profile.
 * Image files live in watch_ai/assets/avatars.
 * Put a name in `credit` to credit that avatar's artist.
 */
export const CUSTOM_AVATARS: CustomAvatar[] = [
  {
    id: 'axolotl',
    source: require('../../assets/avatars/axolotl.jpg'),
    credit: '',
  },
  {
    id: 'blackCat',
    source: require('../../assets/avatars/blackCat.jpg'),
    credit: '',
  },
  {
    id: 'capy1',
    source: require('../../assets/avatars/capy1.jpg'),
    credit: '',
  },
  {
    id: 'cat1',
    source: require('../../assets/avatars/cat1.jpg'),
    credit: '',
  },
  {
    id: 'cat2',
    source: require('../../assets/avatars/cat2.jpg'),
    credit: '',
  },
  {
    id: 'greyCat',
    source: require('../../assets/avatars/greyCat.jpg'),
    credit: '',
  },
  {
    id: 'pungen',
    source: require('../../assets/avatars/pungen.jpg'),
    credit: '',
  },
];