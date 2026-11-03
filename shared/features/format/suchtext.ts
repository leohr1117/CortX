import { ART, type LeseBlock, type LeseTeil } from './baum.ts';
import { leseBaum } from './lesen.ts';

function teileText(teile: readonly LeseTeil[]): string {
  let aus = '';
  for (const teil of teile) {
    if (teil.art === ART.link) aus += teileText(teil.teile);
    else if ('text' in teil) aus += teil.text;
    else aus += teileText(teil.teile);
  }
  return aus;
}

function blockText(block: LeseBlock): string {
  if (block.art === ART.codeblock) return block.text;
  if (block.art === ART.ueberschrift || block.art === ART.wichtig) return teileText(block.teile);
  if (block.art === ART.liste) return block.punkte.map((teile) => teileText(teile)).join('\n');
  if (block.art === ART.haken) return block.punkte.map((punkt) => teileText(punkt.teile)).join('\n');
  return block.zeilen.map((teile) => teileText(teile)).join('\n');
}

export function suchtext(text: string): string {
  return leseBaum(text).map(blockText).join('\n');
}
