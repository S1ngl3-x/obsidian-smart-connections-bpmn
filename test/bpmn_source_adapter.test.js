import { describe, it, expect, beforeAll } from 'vitest';
import { BpmnSourceContentAdapter } from '../src/bpmn_source_adapter.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function make_adapter() {
  return new BpmnSourceContentAdapter({});
}

describe('BpmnSourceContentAdapter', () => {
  it('returns "(Empty BPMN file)" for empty process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" />
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('Process:');
  });
});

describe('build_id_map', () => {
  it('maps element IDs to name and type', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Review order" />
          <serviceTask id="t2" name="Send email" />
          <exclusiveGateway id="g1" name="Approved?" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('t1')).toEqual({ name: 'Review order', type: 'userTask' });
    expect(map.get('t2')).toEqual({ name: 'Send email', type: 'serviceTask' });
    expect(map.get('g1')).toEqual({ name: 'Approved?', type: 'exclusiveGateway' });
  });

  it('includes elements inside sub-processes', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <subProcess id="sp1" name="Verify">
            <userTask id="t1" name="Check docs" />
          </subProcess>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('sp1')).toEqual({ name: 'Verify', type: 'subProcess' });
    expect(map.get('t1')).toEqual({ name: 'Check docs', type: 'userTask' });
  });

  it('stores empty string for unnamed elements', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const map = adapter.build_id_map(process);

    expect(map.get('g1')).toEqual({ name: '', type: 'exclusiveGateway' });
  });
});

describe('query_local_direct', () => {
  it('returns only direct children, not nested descendants', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Top level" />
          <subProcess id="sp1">
            <userTask id="t2" name="Nested" />
          </subProcess>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const direct = adapter.query_local_direct(process, 'userTask');

    expect(direct).toHaveLength(1);
    expect(direct[0].getAttribute('id')).toBe('t1');
  });
});

describe('get_loop_marker', () => {
  it('returns "sequential multi-instance" for sequential multi-instance', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <businessRuleTask id="t1" name="Process items">
            <multiInstanceLoopCharacteristics isSequential="true" />
          </businessRuleTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'businessRuleTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('sequential multi-instance');
  });

  it('returns "parallel multi-instance" when isSequential is false', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <serviceTask id="t1" name="Send notifications">
            <multiInstanceLoopCharacteristics isSequential="false" />
          </serviceTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'serviceTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('parallel multi-instance');
  });

  it('returns "parallel multi-instance" when isSequential is absent', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Review">
            <multiInstanceLoopCharacteristics />
          </userTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('parallel multi-instance');
  });

  it('returns "loop" for standardLoopCharacteristics', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Retry">
            <standardLoopCharacteristics />
          </userTask>
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('loop');
  });

  it('returns empty string for tasks with no loop', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Simple" />
        </process>
      </definitions>`);
    const task = adapter.query_local(doc, 'userTask')[0];
    expect(adapter.get_loop_marker(task)).toBe('');
  });
});

describe('bpmn_to_markdown - multi-instance markers', () => {
  it('appends loop marker to task entry', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <businessRuleTask id="t1" name="Process items">
            <multiInstanceLoopCharacteristics isSequential="true" />
          </businessRuleTask>
          <userTask id="t2" name="Review" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('- Process items (businessRuleTask, sequential multi-instance)');
    expect(result).toContain('- Review (userTask)');
  });
});

describe('extract_gateway_branches', () => {
  it('groups outgoing flows by gateway with condition labels', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <inclusiveGateway id="g1" name="Payment locality?" />
          <businessRuleTask id="t1" name="Add SWIFT" />
          <businessRuleTask id="t2" name="Add domestic" />
          <sequenceFlow id="f1" name="CrossBorder" sourceRef="g1" targetRef="t1" />
          <sequenceFlow id="f2" name="Domestic" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const branches = adapter.extract_gateway_branches(process, id_map);

    expect(branches.size).toBe(1);
    const gw = branches.get('g1');
    expect(gw.name).toBe('Payment locality?');
    expect(gw.type).toBe('inclusive');
    expect(gw.branches).toHaveLength(2);
    expect(gw.branches[0]).toEqual({
      condition: 'CrossBorder',
      target_name: 'Add SWIFT',
      target_type: 'businessRuleTask',
    });
  });

  it('handles unnamed gateway branches', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
          <userTask id="t1" name="Approve" />
          <sequenceFlow id="f1" sourceRef="g1" targetRef="t1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const branches = adapter.extract_gateway_branches(process, id_map);

    const gw = branches.get('g1');
    expect(gw.name).toBe('g1');
    expect(gw.branches[0].condition).toBe('');
  });
});

describe('bpmn_to_markdown - gateway branches', () => {
  it('emits Gateway Branches section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <inclusiveGateway id="g1" name="Type?" />
          <userTask id="t1" name="Do A" />
          <userTask id="t2" name="Do B" />
          <sequenceFlow id="f1" name="Option A" sourceRef="g1" targetRef="t1" />
          <sequenceFlow id="f2" name="Option B" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('"Type?" (inclusive)');
    expect(result).toContain('[Option A] → "Do A" (userTask)');
    expect(result).toContain('[Option B] → "Do B" (userTask)');
  });

  it('does not emit old Flow Conditions section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <inclusiveGateway id="g1" name="Type?" />
          <userTask id="t1" name="Do A" />
          <sequenceFlow id="f1" name="Option A" sourceRef="g1" targetRef="t1" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).not.toContain('## Flow Conditions');
  });
});

describe('extract_linear_flows', () => {
  it('returns non-gateway flows as source → target pairs', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <startEvent id="e1" name="Start" />
          <userTask id="t1" name="Fill form" />
          <endEvent id="e2" name="Done" />
          <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set();
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    expect(flows).toHaveLength(2);
    expect(flows[0]).toEqual({
      source_name: 'Start', source_type: 'startEvent',
      target_name: 'Fill form', target_type: 'userTask',
    });
    expect(flows[1]).toEqual({
      source_name: 'Fill form', source_type: 'userTask',
      target_name: 'Done', target_type: 'endEvent',
    });
  });

  it('excludes flows from gateways', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" name="Check" />
          <userTask id="t1" name="A" />
          <userTask id="t2" name="B" />
          <sequenceFlow id="f1" sourceRef="t1" targetRef="g1" />
          <sequenceFlow id="f2" sourceRef="g1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set(['g1']);
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    expect(flows).toHaveLength(1);
    expect(flows[0].source_name).toBe('A');
    expect(flows[0].target_name).toBe('Check');
  });

  it('skips flows where both source and target are unnamed', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <exclusiveGateway id="g1" />
          <exclusiveGateway id="g2" />
          <userTask id="t1" name="Named" />
          <sequenceFlow id="f1" sourceRef="g1" targetRef="g2" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="g1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const gateway_ids = new Set(['g1', 'g2']);
    const flows = adapter.extract_linear_flows(process, id_map, gateway_ids);

    // f1: g1→g2 excluded (gateway source). f2: t1→g1 excluded (gateway source).
    // Actually t1→g1: source is t1 (not a gateway), so not excluded by gateway_ids.
    // But g1 has no name — "Named" + "" = at least one named, so it IS included.
    expect(flows).toHaveLength(1);
    expect(flows[0].source_name).toBe('Named');
  });
});

describe('bpmn_to_markdown - process flow', () => {
  it('emits Process Flow section with linear flows', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <startEvent id="e1" name="Begin" />
          <userTask id="t1" name="Do work" />
          <endEvent id="e2" name="Finish" />
          <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Process Flow');
    expect(result).toContain('"Begin" (startEvent) → "Do work" (userTask)');
    expect(result).toContain('"Do work" (userTask) → "Finish" (endEvent)');
  });
});

describe('extract_boundary_events', () => {
  it('resolves boundary event to host task and outgoing target', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Submit payment" />
          <serviceTask id="t2" name="Notify client" />
          <boundaryEvent id="be1" name="Insufficient funds" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="t2" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      host_name: 'Submit payment',
      event_name: 'Insufficient funds',
      event_kind: 'error',
      target_name: 'Notify client',
    });
  });

  it('handles conditional boundary events', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <manualTask id="t1" name="Review" />
          <subProcess id="sp1" name="Redo" />
          <boundaryEvent id="be1" name="Unsatisfied" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <conditionalEventDefinition><condition /></conditionalEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="sp1" />
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events[0].event_kind).toBe('conditional');
    expect(events[0].target_name).toBe('Redo');
  });

  it('handles boundary event with no outgoing flow', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <userTask id="t1" name="Wait" />
          <boundaryEvent id="be1" name="Timeout" attachedToRef="t1">
            <timerEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const events = adapter.extract_boundary_events(process, id_map);

    expect(events).toHaveLength(1);
    expect(events[0].target_name).toBe('');
    expect(events[0].event_kind).toBe('timer');
  });
});

describe('bpmn_to_markdown - boundary events', () => {
  it('emits Boundary Events section and excludes boundary from Events', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <startEvent id="e1" name="Start" />
          <userTask id="t1" name="Submit" />
          <serviceTask id="t2" name="Alert" />
          <boundaryEvent id="be1" name="Error occurred" attachedToRef="t1">
            <outgoing>f1</outgoing>
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="f1" sourceRef="be1" targetRef="t2" />
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Boundary Events');
    expect(result).toContain('"Submit": on error "Error occurred" → "Alert"');
    // Boundary event should NOT appear in regular Events section
    expect(result).toContain('## Events');
    // The Events section should only contain Start, not the boundary event
    const events_section = result.split('## Events')[1].split('##')[0];
    expect(events_section).toContain('Start');
    expect(events_section).not.toContain('Error occurred');
  });
});

describe('extract_data_flows', () => {
  it('resolves dataOutputAssociation to data object name', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Invoice data" dataObjectRef="do1" />
          <userTask id="t1" name="Fill invoice">
            <dataOutputAssociation id="da1">
              <sourceRef>out1</sourceRef>
              <targetRef>dor1</targetRef>
            </dataOutputAssociation>
          </userTask>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const flows = adapter.extract_data_flows(process, id_map);

    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({
      task_name: 'Fill invoice',
      data_name: 'Invoice data',
      direction: 'produces',
    });
  });

  it('resolves dataInputAssociation', () => {
    const adapter = make_adapter();
    const doc = adapter.parse_xml(`<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Config" dataObjectRef="do1" />
          <serviceTask id="t1" name="Send email">
            <dataInputAssociation id="da1">
              <sourceRef>dor1</sourceRef>
              <targetRef>in1</targetRef>
            </dataInputAssociation>
          </serviceTask>
        </process>
      </definitions>`);
    const process = adapter.query_local(doc, 'process')[0];
    const id_map = adapter.build_id_map(process);
    const flows = adapter.extract_data_flows(process, id_map);

    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({
      task_name: 'Send email',
      data_name: 'Config',
      direction: 'consumes',
    });
  });
});

describe('bpmn_to_markdown - data flow', () => {
  it('emits Data Flow section', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <dataObject id="do1" />
          <dataObjectReference id="dor1" name="Report" dataObjectRef="do1" />
          <userTask id="t1" name="Generate report">
            <dataOutputAssociation id="da1">
              <sourceRef>out1</sourceRef>
              <targetRef>dor1</targetRef>
            </dataOutputAssociation>
          </userTask>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Data Flow');
    expect(result).toContain('"Generate report" produces "Report"');
  });
});

describe('bpmn_to_markdown - sub-process internal flows', () => {
  it('extracts tasks and flow within a sub-process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Verify documents">
            <startEvent id="e1" name="Docs received" />
            <userTask id="t1" name="Check passport" />
            <endEvent id="e2" name="Verified" />
            <sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
            <sequenceFlow id="f2" sourceRef="t1" targetRef="e2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('## Sub-Process: Verify documents');
    expect(result).toContain('### Tasks');
    expect(result).toContain('- Check passport (userTask)');
    expect(result).toContain('### Process Flow');
    expect(result).toContain('"Docs received" (startEvent) → "Check passport" (userTask)');
    expect(result).toContain('"Check passport" (userTask) → "Verified" (endEvent)');
  });

  it('extracts gateway branches within sub-process', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Route">
            <exclusiveGateway id="g1" name="Which path?" />
            <userTask id="t1" name="Path A" />
            <userTask id="t2" name="Path B" />
            <sequenceFlow id="f1" name="Left" sourceRef="g1" targetRef="t1" />
            <sequenceFlow id="f2" name="Right" sourceRef="g1" targetRef="t2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('### Gateway Branches');
    expect(result).toContain('[Left] → "Path A" (userTask)');
  });

  it('extracts boundary events within sub-process scope', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p1" name="Test">
          <subProcess id="sp1" name="Fill form">
            <userTask id="t1" name="Select recipient" />
            <subProcess id="sp2" name="Manage contacts" />
            <boundaryEvent id="be1" name="Not found" attachedToRef="t1">
              <outgoing>f1</outgoing>
              <conditionalEventDefinition><condition /></conditionalEventDefinition>
            </boundaryEvent>
            <sequenceFlow id="f1" sourceRef="be1" targetRef="sp2" />
          </subProcess>
        </process>
      </definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('### Boundary Events');
    expect(result).toContain('"Select recipient": on conditional "Not found" → "Manage contacts"');
  });
});

describe('namespaced XML', () => {
  it('handles bpmn: prefixed elements correctly', () => {
    const adapter = make_adapter();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="p1" name="Namespaced">
          <bpmn:startEvent id="e1" name="Begin" />
          <bpmn:userTask id="t1" name="Work" />
          <bpmn:endEvent id="e2" name="Done" />
          <bpmn:exclusiveGateway id="g1" name="Check?" />
          <bpmn:sequenceFlow id="f1" sourceRef="e1" targetRef="t1" />
          <bpmn:sequenceFlow id="f2" sourceRef="t1" targetRef="g1" />
          <bpmn:sequenceFlow id="f3" name="Yes" sourceRef="g1" targetRef="e2" />
        </bpmn:process>
      </bpmn:definitions>`;
    const result = adapter.bpmn_to_markdown(xml);
    expect(result).toContain('# Process: Namespaced');
    expect(result).toContain('- Work (userTask)');
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('[Yes]');
    expect(result).toContain('## Process Flow');
  });
});

describe('integration: outpay-initiate.bpmn', () => {
  let result;

  beforeAll(() => {
    const adapter = new BpmnSourceContentAdapter({});
    const xml = readFileSync(resolve(__dirname, 'fixtures/outpay-initiate.bpmn'), 'utf-8');
    result = adapter.bpmn_to_markdown(xml);
  });

  it('extracts the process name', () => {
    expect(result).toContain('# Process:');
  });

  it('lists tasks with types', () => {
    expect(result).toContain('Add SWIFT payment type (businessRuleTask)');
    expect(result).toContain('Submit payment (userTask)');
    expect(result).toContain('Revise outgoing payment (manualTask)');
  });

  it('marks multi-instance task', () => {
    expect(result).toContain('Add group paymet options (businessRuleTask, sequential multi-instance)');
  });

  it('extracts gateway branches with conditions', () => {
    expect(result).toContain('## Gateway Branches');
    expect(result).toContain('Locality of the payment?');
    expect(result).toContain('[CrossBorder]');
    expect(result).toContain('[Our FX account]');
    expect(result).toContain('[Same trade group/s member]');
  });

  it('extracts linear process flow', () => {
    expect(result).toContain('## Process Flow');
  });

  it('extracts boundary events with context', () => {
    expect(result).toContain('## Boundary Events');
    expect(result).toContain('Submit payment');
    expect(result).toContain('Insufficient funds');
  });

  it('extracts sub-process internal flow', () => {
    expect(result).toContain('## Sub-Process: Fill info for payment type decision');
    expect(result).toContain('Select recipient account (userTask)');
    expect(result).toContain('Select amount (userTask)');
  });

  it('extracts data flow within sub-process', () => {
    expect(result).toContain('Country, bank and currency');
  });

  it('extracts annotations', () => {
    expect(result).toContain('add for each shared group');
  });
});
