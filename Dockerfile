FROM node:26-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
COPY web/embed.go web/
COPY --from=web /src/web/dist web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /gantry ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go /gantry /gantry
EXPOSE 8080
ENTRYPOINT ["/gantry"]
