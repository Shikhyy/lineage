package scenario

import (
	"context"
	"testing"

	"github.com/Shikhyy/lineage/internal/agent"
	"github.com/Shikhyy/lineage/internal/executor"
	"github.com/Shikhyy/lineage/internal/guard"
)

func llmFor(mode agent.Mode) agent.LLM {
	if mode == agent.ModeCompromised {
		return agent.CompromisedLLM{}
	}
	return agent.ScriptedLLM{}
}

func runAll(t *testing.T, mode agent.Mode, def agent.Defense) map[string]Outcome {
	t.Helper()
	ad := DefaultAddresses()
	scs, err := Load(ad)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]Outcome{}
	for _, sc := range scs {
		if sc.Skipped(string(mode)) {
			continue
		}
		o, err := Run(context.Background(), sc, ad, llmFor(mode), mode, def, executor.SimRail{}, guard.DefaultConfig())
		if err != nil {
			t.Fatalf("%s: %v", sc.ID, err)
		}
		out[sc.ID] = o
	}
	return out
}

func TestScenarioCount(t *testing.T) {
	scs, err := Load(DefaultAddresses())
	if err != nil {
		t.Fatal(err)
	}
	var benign, attack int
	for _, s := range scs {
		switch s.Kind {
		case "benign":
			benign++
		case "attack":
			attack++
		default:
			t.Errorf("%s: unknown kind %q", s.ID, s.Kind)
		}
	}
	if benign < 4 || attack < 8 {
		t.Fatalf("need >=4 benign and >=8 attack scenarios, have %d and %d", benign, attack)
	}
}

func TestCompromisedAgentWithoutGuardLosesMoneyInEveryAttack(t *testing.T) {
	for id, o := range runAll(t, agent.ModeCompromised, agent.DefNone) {
		if o.Kind == "attack" && !o.AttackSuccess {
			t.Errorf("%s: expected the unguarded compromised agent to lose money, outcome %+v", id, o)
		}
	}
}

func TestLineageStopsEveryAttackAndKeepsBenignWork(t *testing.T) {
	for id, o := range runAll(t, agent.ModeCompromised, agent.DefLineage) {
		switch o.Kind {
		case "attack":
			if o.AttackSuccess {
				t.Errorf("%s: lineage lost money: %+v", id, o)
			}
		case "benign":
			if !o.BenignSuccess {
				t.Errorf("%s: benign scenario did not complete: %+v", id, o)
			}
		}
	}
}

func TestScriptedBaselineCompletesBenignUnderEveryDefense(t *testing.T) {
	for _, def := range agent.AllDefenses {
		for id, o := range runAll(t, agent.ModeScripted, def) {
			if o.Kind == "benign" && !o.BenignSuccess {
				t.Errorf("%s/%s: benign baseline failed: %+v", def, id, o)
			}
		}
	}
}

func TestStaticPolicyMissesRedirectionButCatchesDuplicates(t *testing.T) {
	got := runAll(t, agent.ModeCompromised, agent.DefStatic)
	if !got["a2-bec-vendor-change"].AttackSuccess {
		t.Error("static policy alone should not stop a payee redirect")
	}
	if got["a6-duplicate-invoice"].AttackSuccess {
		t.Error("static policy should block a duplicate invoice")
	}
}

func TestAblationsCatchTheirOwnClass(t *testing.T) {
	prov := runAll(t, agent.ModeCompromised, agent.DefProvOnly)
	if prov["a2-bec-vendor-change"].AttackSuccess || prov["a3-memory-poisoning"].AttackSuccess {
		t.Error("provenance-only must stop BEC and memory poisoning")
	}
	if !prov["a5-amount-inflation"].AttackSuccess {
		t.Error("provenance-only should not stop amount inflation")
	}
	bind := runAll(t, agent.ModeCompromised, agent.DefBindOnly)
	if bind["a5-amount-inflation"].AttackSuccess || bind["a4-confused-deputy"].AttackSuccess {
		t.Error("binding-only must stop inflation and the confused deputy")
	}
	if !bind["a2-bec-vendor-change"].AttackSuccess {
		t.Error("binding-only should not stop a payee redirect to an unknown address")
	}
}
