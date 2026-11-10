package gh

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sync"
)

// ETagTransport replays cached bodies on 304 Not Modified; GitHub does not count 304s against the rate limit.
// Cached bodies are capped at MaxBytes in total, evicting the least recently used first.
// shortcut: any successful REST write clears it all; add per-path invalidation if that costs too many refetches.
type ETagTransport struct {
	Base     http.RoundTripper
	MaxBytes int // total cached body bytes; bodies larger than this are not cached

	mu      sync.Mutex
	entries map[string]*list.Element // values are *etagEntry
	order   *list.List               // front = most recently used
	size    int
}

type etagEntry struct {
	key    string
	etag   string
	header http.Header
	body   []byte
}

func NewETagTransport(base http.RoundTripper) *ETagTransport {
	return &ETagTransport{Base: base, MaxBytes: 50 << 20, entries: map[string]*list.Element{}, order: list.New()}
}

// Clear drops every cached response.
func (t *ETagTransport) Clear() {
	t.mu.Lock()
	defer t.mu.Unlock()
	clear(t.entries)
	t.order.Init()
	t.size = 0
}

func (t *ETagTransport) lookup(key string) (*etagEntry, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	el, ok := t.entries[key]
	if !ok {
		return nil, false
	}
	t.order.MoveToFront(el)
	return el.Value.(*etagEntry), true
}

func (t *ETagTransport) store(e *etagEntry) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if el, ok := t.entries[e.key]; ok {
		t.size -= len(el.Value.(*etagEntry).body)
		t.order.Remove(el)
		delete(t.entries, e.key)
	}
	if len(e.body) > t.MaxBytes {
		return
	}
	t.entries[e.key] = t.order.PushFront(e)
	t.size += len(e.body)
	for t.size > t.MaxBytes {
		old := t.order.Remove(t.order.Back()).(*etagEntry)
		delete(t.entries, old.key)
		t.size -= len(old.body)
	}
}

func (t *ETagTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Method != http.MethodGet {
		resp, err := t.Base.RoundTrip(req)
		// GraphQL reads are POSTs too; only REST writes change cached REST data.
		if err == nil && resp.StatusCode < 400 && req.URL.Path != "/graphql" {
			t.Clear()
		}
		return resp, err
	}
	sum := sha256.Sum256([]byte(req.Header.Get("Authorization") + "\n" + req.Header.Get("Accept") + "\n" + req.URL.String()))
	key := hex.EncodeToString(sum[:])
	e, ok := t.lookup(key)
	if ok {
		req = req.Clone(req.Context())
		req.Header.Set("If-None-Match", e.etag)
	}
	resp, err := t.Base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if ok && resp.StatusCode == http.StatusNotModified {
		resp.Body.Close()
		return &http.Response{
			Status: "200 OK", StatusCode: http.StatusOK, Proto: resp.Proto, ProtoMajor: resp.ProtoMajor, ProtoMinor: resp.ProtoMinor,
			Header: e.header.Clone(), Body: io.NopCloser(bytes.NewReader(e.body)), ContentLength: int64(len(e.body)), Request: req,
		}, nil
	}
	if etag := resp.Header.Get("ETag"); resp.StatusCode == http.StatusOK && etag != "" {
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		t.store(&etagEntry{key: key, etag: etag, header: resp.Header.Clone(), body: body})
		resp.Body = io.NopCloser(bytes.NewReader(body))
	}
	return resp, nil
}
