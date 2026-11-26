import { describe, it, expect } from 'vitest';
import { PumlSourceContentAdapter } from '../src/puml_source_adapter.js';

const to_markdown = (raw) => new PumlSourceContentAdapter({}).to_markdown(raw);

describe('PumlSourceContentAdapter', () => {
  it('handles .puml and .plantuml files', () => {
    expect(PumlSourceContentAdapter.extensions).toEqual(['puml', 'plantuml']);
  });

  it('removes directives and style, keeps the diagram text', () => {
    const result = to_markdown(`@startuml
!include <archimate/Archimate>
left to right direction
skinparam roundcorner 15
skinparam class {
  BackgroundColor #FFFFFF
}
hide empty members
<style>
  note { FontSize 10 }
</style>
title Cashflow forecast
' Source: Confluence page 19071033
class "Forecast Result" {
  available : Boolean
}
"Forecast Result" "1" -- "0..*" "Forecast Balance Point"
@enduml`);
    expect(result).toBe(`title Cashflow forecast
' Source: Confluence page 19071033
class "Forecast Result" {
available : Boolean
}
"Forecast Result" "1" -- "0..*" "Forecast Balance Point"`);
  });

  it('uses the diagram name from @startuml as a heading', () => {
    expect(to_markdown('@startuml liquidity-withdrawal\nactor Client\n@enduml'))
      .toBe('# liquidity-withdrawal\nactor Client');
  });

  it('replaces an alias with its label in relation lines', () => {
    const result = to_markdown(`@startuml
Business_Event(e1, "Withdrawal desired")
Business_Process(e2, "Initiate withdrawal")
actor "Account Owner" as owner
Rel_Triggering(e1, e2, "Triggers")
owner --> e2
@enduml`);
    expect(result).toContain('Rel_Triggering("Withdrawal desired", "Initiate withdrawal", "Triggers")');
    expect(result).toContain('"Account Owner" --> "Initiate withdrawal"');
    expect(result).toContain('Business_Event(e1, "Withdrawal desired")');
  });

  it('returns an empty string for a diagram with no content', () => {
    expect(to_markdown('@startuml\nskinparam roundcorner 15\n@enduml')).toBe('');
  });
});
