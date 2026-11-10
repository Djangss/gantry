package gh

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sync"
)

// ETagTransport replays cached bodies on 304 Not Modified; GitHub does not count 304s against the rate limit.
// shortcut: unbounded map and any successful REST write clears it all; fine for one user, add an LRU and per-path invalidation if memory grows.
type ETagTransport struct {
	Base    http.RoundTripper
	mu      sync.Mutex
	entries map[string]etagEntry
}

type etagEntry struct {
	etag   string
	header http.Header
	body   []byte
}

func NewETagTransport(base http.RoundTripper) *ETagTransport {
	return &ETagTransport{Base: base, entries: map[string]etagEntry{}}
}

func (t *ETagTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Method != http.MethodGet {
		resp, err := t.Base.RoundTrip(req)
		// GraphQL reads are POSTs too; only REST writes change cached REST data.
		if err == nil && resp.StatusCode < 400 && req.URL.Path != "/graphql" {
			t.mu.Lock()
			clear(t.entries)
			t.mu.Unlock()
		}
		return resp, err
	}
	sum := sha256.Sum256([]byte(req.Header.Get("Authorization") + "\n" + req.Header.Get("Accept") + "\n" + req.URL.String()))
	key := hex.EncodeToString(sum[:])
	t.mu.Lock()
	e, ok := t.entries[key]
	t.mu.Unlock()
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
		t.mu.Lock()
		t.entries[key] = etagEntry{etag: etag, header: resp.Header.Clone(), body: body}
		t.mu.Unlock()
		resp.Body = io.NopCloser(bytes.NewReader(body))
	}
	return resp, nil
}
