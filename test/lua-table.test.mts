import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLuaRecords } from '../scripts/lua-table.mts';

test('Lua config records read as data, nested tables included', () => {
  const source = `pg = pg or {}
pg.base.ship_l2d = {}
(function()
	pg.base.ship_l2d[20607218] = {
		draw_able_name = "TouchIdle1",
		mode = 2,
		range = {
			0,
			-10.5
		},
		parts_data = "",
		action_trigger = { circle = true, action = "touch_idle1", type = 2 },
		action_trigger_active = {
			idle_enable = { { 1, { "idle1", 'touch_idle2' } } },
			enable = {},
			idle = 1
		},
		-- a comment
		quoted = "a \\"b\\" \n c",
		[3] = nil
	}
	pg.base.ship_l2d[5] = { id = 5 }
end)()`;
  const records = parseLuaRecords(source, 'ship_l2d');
  assert.deepEqual([...records.keys()], [20607218, 5]);
  assert.deepEqual(records.get(20607218), {
    draw_able_name: 'TouchIdle1', mode: 2, range: [0, -10.5], parts_data: '',
    action_trigger: { circle: true, action: 'touch_idle1', type: 2 },
    action_trigger_active: { idle_enable: [[1, ['idle1', 'touch_idle2']]], enable: [], idle: 1 },
    quoted: 'a "b" \n c', 3: null,
  });
  assert.throws(() => parseLuaRecords('pg.base.t[1] = { a = b }', 't'), /Unexpected value/);
});
