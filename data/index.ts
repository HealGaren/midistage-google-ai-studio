// Song creators - generate songs programmatically instead of loading from JSON
export { createZeitgeistSong } from './zeitgeist';
export { createVolcanoSong } from './volcano';
export { createDesertEagleSong } from './desertEagle';
export { createFMBusinessSong } from './fmBusiness';
export { createAgogSong } from './agog';
export { createApexSong } from './apex';

import { Song } from '../types';
import { createZeitgeistSong } from './zeitgeist';
import { createVolcanoSong } from './volcano';
import { createDesertEagleSong } from './desertEagle';
import { createFMBusinessSong } from './fmBusiness';
import { createAgogSong } from './agog';
import { createApexSong } from './apex';

// Create all songs from the original 260222-songs JSON
export function createAllSongs(): Song[] {
  return [
    createVolcanoSong(),
    createDesertEagleSong(),
    createFMBusinessSong(),
    createAgogSong(),
    createApexSong()
  ];
}

// Create all songs including Zeitgeist
export function createAllSongsWithZeitgeist(): Song[] {
  return [
    createZeitgeistSong(),
    createVolcanoSong(),
    createDesertEagleSong(),
    createFMBusinessSong(),
    createAgogSong(),
    createApexSong()
  ];
}
