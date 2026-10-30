/** Реестр инструментов 2D-редактора. Ключ — id инструмента. */
import { SelectTool } from './SelectTool.js';
import { WallTool } from './WallTool.js';
import { BoxTool } from './BoxTool.js';
import { RoomTool, SiteTool, ZoneTool } from './AreaTools.js';
import { OpeningTool } from './OpeningTool.js';
import { PlaceTool } from './PlaceTool.js';
import { RoofTool } from './RoofTool.js';
import { MeasureTool } from './MeasureTool.js';

export function createTools(editor) {
  return {
    select: new SelectTool(editor),
    wall: new WallTool(editor),
    box: new BoxTool(editor),
    room: new RoomTool(editor),
    door: new OpeningTool(editor, 'door'),
    window: new OpeningTool(editor, 'window'),
    arch: new OpeningTool(editor, 'arch'),
    stair: new PlaceTool(editor, 'stair'),
    item: new PlaceTool(editor, 'item'),
    roof: new RoofTool(editor),
    site: new SiteTool(editor),
    zone: new ZoneTool(editor),
    measure: new MeasureTool(editor),
  };
}
