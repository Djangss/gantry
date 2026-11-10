// Package auth handles GitHub OAuth sign-in and the encrypted session cookie.
package auth

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Session struct {
	Token string `json:"t"`
	Login string `json:"l"`
}

type Options struct {
	ClientID, ClientSecret string
	AllowedLogin           string
	BaseURL                string // public URL of Gantry, e.g. https://gantry.mijotez.me
	WebURL                 string // https://github.com
	APIURL                 string // https://api.github.com
	Key                    []byte // 32 bytes
}

type Auth struct {
	opt  Options
	aead cipher.AEAD
	http *http.Client
}

const (
	sessionCookie = "gantry_session"
	stateCookie   = "gantry_state"
)

type ctxKey struct{}

func New(opt Options) (*Auth, error) {
	block, err := aes.NewCipher(opt.Key)
	if err != nil {
		return nil, fmt.Errorf("cookie key: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Auth{opt: opt, aead: aead, http: &http.Client{Timeout: 15 * time.Second}}, nil
}

func FromContext(ctx context.Context) (Session, bool) {
	s, ok := ctx.Value(ctxKey{}).(Session)
	return s, ok
}

func (a *Auth) secure() bool { return strings.HasPrefix(a.opt.BaseURL, "https://") }

func (a *Auth) seal(s Session) (string, error) {
	b, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, a.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(a.aead.Seal(nonce, nonce, b, nil)), nil
}

func (a *Auth) open(v string) (Session, error) {
	var s Session
	b, err := base64.RawURLEncoding.DecodeString(v)
	n := a.aead.NonceSize()
	if err != nil || len(b) < n {
		return s, errors.New("bad session")
	}
	plain, err := a.aead.Open(nil, b[:n], b[n:], nil)
	if err != nil {
		return s, errors.New("bad session")
	}
	return s, json.Unmarshal(plain, &s)
}

func (a *Auth) SetSession(w http.ResponseWriter, s Session) error {
	v, err := a.seal(s)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: v, Path: "/", MaxAge: 30 * 24 * 3600,
		HttpOnly: true, Secure: a.secure(), SameSite: http.SameSiteLaxMode})
	return nil
}

func (a *Auth) ClearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: a.secure(), SameSite: http.SameSiteLaxMode})
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		http.Error(w, "rng failure", http.StatusInternalServerError)
		return
	}
	state := hex.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/auth", MaxAge: 600,
		HttpOnly: true, Secure: a.secure(), SameSite: http.SameSiteLaxMode})
	q := url.Values{
		"client_id":    {a.opt.ClientID},
		"redirect_uri": {a.opt.BaseURL + "/auth/callback"},
		"scope":        {"repo project"},
		"state":        {state},
	}
	http.Redirect(w, r, a.opt.WebURL+"/login/oauth/authorize?"+q.Encode(), http.StatusFound)
}

func (a *Auth) Callback(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(stateCookie)
	if err != nil || c.Value == "" || c.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid OAuth state, try signing in again", http.StatusBadRequest)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Path: "/auth", MaxAge: -1})
	token, err := a.exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		slog.Warn("oauth exchange", "err", err)
		http.Error(w, "GitHub sign-in failed", http.StatusBadGateway)
		return
	}
	login, err := a.user(r.Context(), token)
	if err != nil {
		slog.Warn("oauth user", "err", err)
		http.Error(w, "GitHub sign-in failed", http.StatusBadGateway)
		return
	}
	if !strings.EqualFold(login, a.opt.AllowedLogin) {
		slog.Warn("login rejected", "login", login)
		http.Error(w, "this Gantry instance is private", http.StatusForbidden)
		return
	}
	if err := a.SetSession(w, Session{Token: token, Login: login}); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (a *Auth) exchange(ctx context.Context, code string) (string, error) {
	form := url.Values{
		"client_id":     {a.opt.ClientID},
		"client_secret": {a.opt.ClientSecret},
		"code":          {code},
		"redirect_uri":  {a.opt.BaseURL + "/auth/callback"},
	}
	req, err := http.NewRequestWithContext(ctx, "POST", a.opt.WebURL+"/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := a.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("no token: %s", out.Error)
	}
	return out.AccessToken, nil
}

// revoke deletes the OAuth token on GitHub, so a copied cookie stops working too.
func (a *Auth) revoke(ctx context.Context, token string) error {
	body, _ := json.Marshal(map[string]string{"access_token": token})
	req, err := http.NewRequestWithContext(ctx, "DELETE", a.opt.APIURL+"/applications/"+url.PathEscape(a.opt.ClientID)+"/token", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(a.opt.ClientID, a.opt.ClientSecret)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("DELETE token: %s", resp.Status)
	}
	return nil
}

func (a *Auth) user(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", a.opt.APIURL+"/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := a.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET /user: %s", resp.Status)
	}
	var u struct {
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", err
	}
	return u.Login, nil
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		if s, err := a.open(c.Value); err == nil {
			if err := a.revoke(r.Context(), s.Token); err != nil {
				slog.Warn("logout: token not revoked", "err", err)
			}
		}
	}
	a.ClearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

// Require rejects requests without a valid session for the allowlisted login.
func (a *Auth) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var s Session
		c, err := r.Cookie(sessionCookie)
		if err == nil {
			s, err = a.open(c.Value)
		}
		if err != nil || s.Token == "" || !strings.EqualFold(s.Login, a.opt.AllowedLogin) {
			a.ClearSession(w)
			jsonError(w, http.StatusUnauthorized, "not signed in", "unauthorized")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, s)))
	})
}

// CSRF requires X-Requested-With: gantry on mutating requests; cross-site forms cannot set it.
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Requested-With") != "gantry" {
			jsonError(w, http.StatusForbidden, "missing X-Requested-With header", "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonError(w http.ResponseWriter, status int, msg, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg, "code": code})
}
