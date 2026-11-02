export interface Versionseintrag {
  version: string;
  datum: string;
  zeilen: readonly string[];
}

export const VERSIONEN: readonly Versionseintrag[] = [
  {
    version: '1.5.4',
    datum: '2026-11-02',
    zeilen: ['Change password in a password manager opens the Stride page.'],
  },
  {
    version: '1.5.3',
    datum: '2026-11-02',
    zeilen: [
      "What's new lists every version, newest first.",
      'After an update, CortX tells you once.',
      "A dot on the library menu stays until you open What's new.",
    ],
  },
  {
    version: '1.5.2',
    datum: '2026-11-02',
    zeilen: [
      'Sign in with a password manager.',
      'If the password is wrong, the username stays, and you can show the password while you type.',
      'Change your password in Stride.',
    ],
  },
  {
    version: '1.5.1',
    datum: '2026-11-02',
    zeilen: [
      'The home screen name is CortX.',
      'The icon is three lines of a note on a dark square.',
      "It fills the phone's icon shape, so no white ring shows around it.",
    ],
  },
  {
    version: '1.5.0',
    datum: '2026-11-02',
    zeilen: [
      'Tap a note to open it. The pencil turns the same page into a place to write.',
      'Inbox, a topic, and search show the whole note.',
      'Edits are saved as you go, and when you go back.',
      'Change the topic or delete the note from the menu, and undo a delete.',
    ],
  },
  {
    version: '1.4.1',
    datum: '2026-11-02',
    zeilen: [
      'Sign in with your Stride username and password.',
      'A wrong password, too many attempts, or a rejected sign-in is reported as that.',
    ],
  },
  {
    version: '1.4.0',
    datum: '2026-11-02',
    zeilen: [
      'A date or a time in the text shows under the note while you read.',
      'English and German both work, such as "tomorrow 3pm" or "03.11.".',
      'The day follows when the note was written.',
    ],
  },
  {
    version: '1.3.0',
    datum: '2026-11-02',
    zeilen: [
      'Heading marks the line at the cursor, or turns it back into text.',
      'Reading shows that line as a heading.',
      'A heading is not a #topic. #topic still files the note.',
    ],
  },
  {
    version: '1.2.0',
    datum: '2026-11-02',
    zeilen: [
      'Lists, checkboxes, and bold text show while you read.',
      'This shows on a topic, in Inbox, and in search.',
      'The saved note stays plain text.',
    ],
  },
  {
    version: '1.1.0',
    datum: '2026-11-02',
    zeilen: [
      'Search your notes from the library.',
      'Each match shows the note and its topic, newest first.',
      'Open a match to read the note where it was filed.',
    ],
  },
  {
    version: '1.0.0',
    datum: '2026-11-02',
    zeilen: [
      'Sign in with your Stride account. Your notes stay on that account.',
      'Sign out from the library.',
      'A draft stays on this device while you are offline, and notes filed offline sync after you sign in.',
    ],
  },
  {
    version: '0.5.0',
    datum: '2026-11-01',
    zeilen: [
      'Edit or delete a note from its menu.',
      'A deleted note can be undone.',
      'Discarding an edit asks you first.',
    ],
  },
  {
    version: '0.4.0',
    datum: '2026-11-01',
    zeilen: [
      'Rename, merge, or delete a topic from its menu.',
      'A deleted or merged topic can be undone.',
      'Deleting a topic moves its notes to Inbox.',
    ],
  },
  {
    version: '0.3.0',
    datum: '2026-11-01',
    zeilen: [
      'The library lists Inbox and your topics.',
      'Open a topic to read its notes, newest first.',
      'An empty library or an empty Inbox shows one line.',
    ],
  },
  {
    version: '0.2.0',
    datum: '2026-11-01',
    zeilen: [
      'Change the topic right after you file a note.',
      'A draft is kept on this device as you type.',
      'A note filed offline is sent when you are back online.',
    ],
  },
  {
    version: '0.1.0',
    datum: '2026-11-01',
    zeilen: [
      'Write a note and file it.',
      'A #topic picks the topic. Without one, the note goes to Inbox.',
      'You can install CortX on your phone.',
    ],
  },
];

const ersteVersion = VERSIONEN[0];
if (!ersteVersion) throw new Error('A version is missing.');
export const AKTUELLE_VERSION = ersteVersion.version;
