/**
 * Testes de queries ServiceNow — src/snow/queries.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPollQuery, buildPollParams } from '../src/snow/queries.js';

const mockQueryConfig = {
  id: 'n2-poll',
  baseFilters: [
    'stateNOT IN15,6,7,503',
    'u_qs_type=Incident',
    'assignment_group=25f28e6a87363a98ed9e85930cbb3518',
  ],
  dynamicFilters: [
    'assigned_to=EMPTY',
    'sys_updated_on>javascript:gs.minutesAgo({minutesAgo})',
  ],
  params: {
    sysparm_display_value: 'all',
    sysparm_limit: '{limit}',
  },
  fields: ['sys_id', 'number'],
};

describe('snow/queries', () => {
  test('buildPollQuery inclui filtros base e dinâmicos', () => {
    const query = buildPollQuery(mockQueryConfig, { minutesAgo: 2 });
    assert.ok(query.includes('stateNOT IN15,6,7,503'));
    assert.ok(query.includes('assigned_to=EMPTY'));
    assert.ok(query.includes('sys_updated_on>javascript:gs.minutesAgo(2)'));
  });

  test('buildPollQuery substitui assignment_group por IN quando sys_ids fornecidos', () => {
    const query = buildPollQuery(mockQueryConfig, {
      assignmentGroupSysIds: ['group1', 'group2'],
    });
    assert.ok(query.includes('assignment_groupINgroup1,group2'));
    assert.ok(!query.includes('assignment_group=25f28e6a'));
  });

  test('buildPollParams monta sysparm_fields e limit', () => {
    const params = buildPollParams(mockQueryConfig, {
      minutesAgo: 5,
      limit: 25,
      assignmentGroupSysIds: ['abc'],
    });
    assert.equal(params.sysparm_fields, 'sys_id,number');
    assert.equal(params.sysparm_limit, '25');
    assert.equal(params.sysparm_display_value, 'all');
    assert.ok(params.sysparm_query.includes('assignment_groupINabc'));
  });
});

describe('snow/groups - buildQueueFilter', () => {
  test('combina grupos no modo both', async () => {
    const { buildQueueFilter } = await import('../src/snow/groups.js');
    const userGroups = [{ sys_id: 'g1', name: 'Group 1' }];
    const explicitGroups = [{ sys_id: 'g2', name: 'Group 2' }];
    const filter = buildQueueFilter('both', userGroups, explicitGroups);
    assert.deepEqual(filter.sysIds, ['g1', 'g2']);
    assert.equal(filter.assignmentGroupClause, 'assignment_groupINg1,g2');
  });

  test('deduplica sys_ids', async () => {
    const { buildQueueFilter } = await import('../src/snow/groups.js');
    const groups = [{ sys_id: 'g1', name: 'A' }, { sys_id: 'g1', name: 'B' }];
    const filter = buildQueueFilter('user', groups, []);
    assert.deepEqual(filter.sysIds, ['g1']);
  });
});

describe('snow/incidents - normalizeIncident', () => {
  test('extrai caller AAD de display_value=all', async () => {
    const { normalizeIncident, extractCallerAadObjectId } = await import(
      '../src/snow/incidents.js'
    );

    const raw = {
      sys_id: { value: 'inc123', display_value: 'inc123' },
      caller_id: {
        value: 'user123',
        display_value: 'John Doe',
        link: 'https://example.com/user123',
      },
      u_aad_object_id: { value: 'aad-object-id-xyz', display_value: 'aad-object-id-xyz' },
    };

    const normalized = normalizeIncident(raw);
    assert.equal(normalized.caller_id.u_aad_object_id, 'aad-object-id-xyz');
    assert.equal(extractCallerAadObjectId(normalized), 'aad-object-id-xyz');
  });
});

describe('snow/client - resolveAuthConfig', () => {
  test('resolve perfil read e write separadamente', async () => {
    const { resolveAuthConfig } = await import('../src/snow/client.js');

    const config = {
      read: { instanceUrl: 'https://read.example.com', username: 'reader' },
      write: { instanceUrl: 'https://write.example.com', username: 'writer' },
    };

    assert.equal(resolveAuthConfig(config, 'read').username, 'reader');
    assert.equal(resolveAuthConfig(config, 'write').username, 'writer');
  });
});
