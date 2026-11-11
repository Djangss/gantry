// Package gh is a thin GitHub client: go-github for REST, raw GraphQL for Projects v2.
package gh

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	HTTP   *http.Client
	APIURL string
	cache  *ETagTransport
}

func New(apiURL string) *Client {
	cache := NewETagTransport(http.DefaultTransport)
	return &Client{
		HTTP:   &http.Client{Transport: cache, Timeout: 30 * time.Second},
		APIURL: strings.TrimRight(apiURL, "/"),
		cache:  cache,
	}
}

// ClearCache drops cached responses, e.g. when a webhook says GitHub data changed.
func (c *Client) ClearCache() { c.cache.Clear() }

// Error is a GitHub failure. Status 0 means the request never got a response.
type Error struct {
	Status      int
	Message     string
	Reset       time.Time
	RateLimited bool
}

func (e *Error) Error() string { return fmt.Sprintf("github %d: %s", e.Status, e.Message) }

// do sends a raw API request; REST calls go through go-github instead (see rest).
func (c *Client) do(ctx context.Context, token, method, path, accept string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.APIURL+path, body)
	if err != nil {
		return err
	}
	if accept == "" {
		accept = "application/vnd.github+json"
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return &Error{Message: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return errorFrom(resp)
	}
	switch o := out.(type) {
	case nil:
		return nil
	case *[]byte:
		*o, err = io.ReadAll(resp.Body)
		return err
	default:
		return json.NewDecoder(resp.Body).Decode(out)
	}
}

func errorFrom(resp *http.Response) *Error {
	var b struct {
		Message string `json:"message"`
	}
	json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&b)
	e := &Error{Status: resp.StatusCode, Message: b.Message}
	if resp.StatusCode == http.StatusTooManyRequests ||
		(resp.StatusCode == http.StatusForbidden && resp.Header.Get("X-RateLimit-Remaining") == "0") {
		e.RateLimited = true
		if s, err := strconv.ParseInt(resp.Header.Get("X-RateLimit-Reset"), 10, 64); err == nil {
			e.Reset = time.Unix(s, 0)
		}
	}
	return e
}
