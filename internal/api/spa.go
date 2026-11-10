package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// spaHandler serves built assets and falls back to index.html for client routes.
func spaHandler(dist fs.FS) http.Handler {
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" {
			if _, err := fs.Stat(dist, p); err != nil {
				http.ServeFileFS(w, r, dist, "index.html")
				return
			}
		}
		files.ServeHTTP(w, r)
	})
}
