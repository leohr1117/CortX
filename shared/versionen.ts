import { VERSIONEN_ALT, type Versionseintrag } from './versionen-alt.ts';

export const VERSIONEN: readonly Versionseintrag[] = [
  {
    version: '1.14.7',
    datum: '2026-11-11',
    zeilen: [
      'The sign-in mark is a hash.',
      'Under sign-in and in the library menu, by leohr links to leohr.de.',
    ],
  },
  { version: '1.14.6', datum: '2026-11-11', zeilen: ['Keyboard suggestions and autocorrect replace the word being typed, instead of appending to it.'] },
  { version: '1.14.5', datum: '2026-11-11', zeilen: ['The back arrow in the header sits at the start on every screen size and stays inside the safe area.'] },
  {
    version: '1.14.4', datum: '2026-11-10', zeilen: ['Notes are now stored as structured documents. All your existing notes were carried over unchanged.'],
  },
  { version: '1.14.3', datum: '2026-11-09', zeilen: ['The note header now shows only the topic, and on iPad in window mode the back button is no longer covered.'] },
  {
    version: '1.14.2',
    datum: '2026-11-06',
    zeilen: ['Internal cleanup, nothing changes for you.'],
  },
  {
    version: '1.14.1',
    datum: '2026-11-04',
    zeilen: ['List markers keep a gap before the words while you edit, same as when you read.'],
  },
  {
    version: '1.14.0',
    datum: '2026-11-04',
    zeilen: [
      'Numbered lists can use 1., A., a., I., or i.',
      'Enter adds the next item of the same kind. Pasting that Markdown formats it at once.',
      'The formatting bar switches the kind, or turns the line into a list, a task, or plain text.',
    ],
  },
  {
    version: '1.13.1',
    datum: '2026-11-04',
    zeilen: ['Internal cleanup, nothing changes for you.'],
  },
  {
    version: '1.13.0',
    datum: '2026-11-04',
    zeilen: [
      'Capture on the start page shows formatting while you write.',
      'Bold, italic, strikethrough, important, and code can sit inside each other.',
      'Pasting Markdown shows lists, tasks, and the same formatting. A line like #topic/page stays text.',
    ],
  },
  {
    version: '1.12.1',
    datum: '2026-11-03',
    zeilen: [
      'In a note, - , [] and # at the start of a line become a list, a task, or a heading.',
      '**text**, *text*, ~~text~~, !!text!! and `text` become formatting. Backspace right after restores the characters.',
      'With shortcuts off, what you type stays as typed and is saved so it does not format on the next open.',
    ],
  },
  {
    version: '1.12.0',
    datum: '2026-11-03',
    zeilen: [
      'Editing a note shows formatting without the marker characters.',
      'Checkboxes in a note can be toggled, and they stay toggled after a reload.',
    ],
  },
  {
    version: '1.11.1',
    datum: '2026-11-03',
    zeilen: ['Internal cleanup, nothing changes for you.'],
  },
  {
    version: '1.11.0',
    datum: '2026-11-03',
    zeilen: [
      'Enter in a list or task adds the next item of the same kind, and a new checkbox is unchecked.',
      'Enter on an empty item ends the list. Shift+Enter breaks a line inside the item.',
      'Backspace at the start of an empty item turns it into a normal line.',
    ],
  },
  {
    version: '1.10.0',
    datum: '2026-11-03',
    zeilen: [
      'A format on several selected lines applies to each line.',
      'If every selected line already has it, the format comes off.',
    ],
  },
  {
    version: '1.9.0',
    datum: '2026-11-03',
    zeilen: [
      'Deleting one side of bold, italic, strikethrough, important, or code removes the other side too.',
      'The words in between stay.',
    ],
  },
  {
    version: '1.8.13',
    datum: '2026-11-03',
    zeilen: ['Internal cleanup, nothing changes for you.'],
  },
  {
    version: '1.8.12',
    datum: '2026-11-03',
    zeilen: [
      'A topic lists each page on one line.',
      'A long title ends in an ellipsis, and the day it was filed sits beside it.',
    ],
  },
  {
    version: '1.8.11',
    datum: '2026-11-03',
    zeilen: [
      'You can close the update message.',
      'It stays closed after a reload.',
    ],
  },
  {
    version: '1.8.10',
    datum: '2026-11-03',
    zeilen: [
      'Filing, deleting, and moving shows one short message above the keyboard.',
      'Undo on that message puts the change back. It fades on its own, or when you dismiss it.',
    ],
  },
  {
    version: '1.8.9',
    datum: '2026-11-03',
    zeilen: [
      'Words that are both important and code show the gold highlight and the code font.',
      'The order of those two formats does not change the highlight.',
    ],
  },
  {
    version: '1.8.8',
    datum: '2026-11-03',
    zeilen: ['Housekeeping only. CortX looks and works the same.'],
  },
  {
    version: '1.8.7',
    datum: '2026-11-02',
    zeilen: [
      'Bold, italic, strike, important, and code can be nested and turned off in any order.',
      'Each format button stays in step with the text. Turning one off leaves the others in place.',
    ],
  },
  {
    version: '1.8.6',
    datum: '2026-11-02',
    zeilen: [
      'Undo after filing puts your text back into the capture field.',
      'The note you just filed is removed. A note split across pages comes back as one text.',
    ],
  },
  {
    version: '1.8.5',
    datum: '2026-11-02',
    zeilen: [
      'The row that creates a topic, page, or section stays at the bottom while the matches scroll.',
      'The last match stays reachable. A topic without a page still files a new page.',
    ],
  },
  {
    version: '1.8.4',
    datum: '2026-11-02',
    zeilen: [
      'Long lists of pages, topics, and suggestions scroll by touch on a phone and with the wheel on a computer.',
      'On a phone, the format bar stays on the bottom edge, and on the keyboard while it is open.',
      'The File button and the target line sit above the bar.',
    ],
  },
  {
    version: '1.8.3',
    datum: '2026-11-02',
    zeilen: [
      'The page title is the first line, whether it is a heading or a normal paragraph.',
      'A new page is not turned into a heading. A heading that is already there stays one.',
    ],
  },
  {
    version: '1.8.2',
    datum: '2026-11-02',
    zeilen: [
      'On a phone, the format bar sits on the keyboard while you type.',
      'When the keyboard closes, it drops back above the File button. On a note it sits on the bottom edge.',
    ],
  },
  {
    version: '1.8.1',
    datum: '2026-11-02',
    zeilen: [
      'A line that starts with #topic/page files that part of the note. One note can go to several pages.',
      'Text before the first target line goes to the Inbox. A #tag in the middle of a line stays in the text.',
      'An empty topic stays in the library and shows 0 pages until you delete the topic.',
    ],
  },
  {
    version: '1.8.0',
    datum: '2026-11-02',
    zeilen: [
      'A topic lists its pages. The page title is the first heading, and sections are the level-two headings.',
      'While you capture, #topic/page/section shows where the note goes and files it there.',
      'You can undo that. An open editor is never overwritten.',
    ],
  },
  ...VERSIONEN_ALT,
];

const ersteVersion = VERSIONEN[0];
if (!ersteVersion) throw new Error('A version is missing.');
export const AKTUELLE_VERSION = ersteVersion.version;
