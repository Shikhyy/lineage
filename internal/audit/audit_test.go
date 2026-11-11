package audit

import (
	"testing"

	"github.com/Shikhyy/lineage/internal/db"
)

func newLog(t *testing.T) (*Log, func(string, ...any)) {
	t.Helper()
	d, err := db.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	exec := func(q string, a ...any) {
		if _, err := d.Exec(q, a...); err != nil {
			t.Fatal(err)
		}
	}
	return New(d), exec
}

func TestEmptyChainVerifies(t *testing.T) {
	l, _ := newLog(t)
	res, err := l.Verify()
	if err != nil || !res.OK || res.Records != 0 {
		t.Fatalf("got %+v err=%v", res, err)
	}
}

func TestAppendAndVerify(t *testing.T) {
	l, _ := newLog(t)
	for i := 0; i < 5; i++ {
		if _, err := l.Append("decision", map[string]any{"n": i}); err != nil {
			t.Fatal(err)
		}
	}
	res, err := l.Verify()
	if err != nil || !res.OK || res.Records != 5 {
		t.Fatalf("got %+v err=%v", res, err)
	}
	recs, _ := l.List(0)
	if len(recs) != 5 || recs[0].Seq < recs[4].Seq {
		t.Fatalf("expected newest-first list, got %+v", recs)
	}
}

func TestTamperedPayloadIsDetected(t *testing.T) {
	l, exec := newLog(t)
	for i := 0; i < 4; i++ {
		if _, err := l.Append("decision", map[string]any{"n": i}); err != nil {
			t.Fatal(err)
		}
	}
	exec(`UPDATE audit SET payload_json='{"n":99}' WHERE seq=3`)
	res, err := l.Verify()
	if err != nil {
		t.Fatal(err)
	}
	if res.OK || res.BrokenSeq != 3 {
		t.Fatalf("expected first broken seq 3, got %+v", res)
	}
}

func TestDeletedRecordIsDetected(t *testing.T) {
	l, exec := newLog(t)
	for i := 0; i < 4; i++ {
		if _, err := l.Append("decision", map[string]any{"n": i}); err != nil {
			t.Fatal(err)
		}
	}
	exec(`DELETE FROM audit WHERE seq=2`)
	res, _ := l.Verify()
	if res.OK || res.BrokenSeq != 3 {
		t.Fatalf("expected break at seq 3 after deleting seq 2, got %+v", res)
	}
}
