package logger

import (
	"context"
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger wraps zap logger with context support
type Logger struct {
	*zap.SugaredLogger
}

// ctxKey is the context key for logger
type ctxKey struct{}

// New creates a new logger instance
func New(serviceName, environment, level string) (*Logger, error) {
	var config zap.Config

	if environment == "production" {
		config = zap.NewProductionConfig()
	} else {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	// Set log level
	switch level {
	case "debug":
		config.Level.SetLevel(zapcore.DebugLevel)
	case "info":
		config.Level.SetLevel(zapcore.InfoLevel)
	case "warn":
		config.Level.SetLevel(zapcore.WarnLevel)
	case "error":
		config.Level.SetLevel(zapcore.ErrorLevel)
	default:
		config.Level.SetLevel(zapcore.InfoLevel)
	}

	config.OutputPaths = []string{"stdout"}
	config.ErrorOutputPaths = []string{"stderr"}

	zapLogger, err := config.Build(
		zap.AddCallerSkip(1),
		zap.Fields(
			zap.String("service", serviceName),
			zap.String("environment", environment),
		),
	)
	if err != nil {
		return nil, err
	}

	return &Logger{zapLogger.Sugar()}, nil
}

// Default creates a default logger for development
func Default() *Logger {
	logger, _ := New("draymaster", "development", "debug")
	if logger == nil {
		// Fallback to basic logger
		zapLogger, _ := zap.NewDevelopment()
		return &Logger{zapLogger.Sugar()}
	}
	return logger
}

// WithContext returns a logger from context or creates a new one
func WithContext(ctx context.Context) *Logger {
	if logger, ok := ctx.Value(ctxKey{}).(*Logger); ok {
		return logger
	}
	return Default()
}

// ToContext adds logger to context
func ToContext(ctx context.Context, logger *Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

// WithFields returns a logger with additional fields
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	args := make([]interface{}, 0, len(fields)*2)
	for k, v := range fields {
		args = append(args, k, v)
	}
	return &Logger{l.SugaredLogger.With(args...)}
}

// WithRequestID adds request ID to logger
func (l *Logger) WithRequestID(requestID string) *Logger {
	return &Logger{l.SugaredLogger.With("request_id", requestID)}
}

// WithTraceID adds trace ID to logger
func (l *Logger) WithTraceID(traceID string) *Logger {
	return &Logger{l.SugaredLogger.With("trace_id", traceID)}
}

// WithUserID adds user ID to logger
func (l *Logger) WithUserID(userID string) *Logger {
	return &Logger{l.SugaredLogger.With("user_id", userID)}
}

// WithError adds error to logger
func (l *Logger) WithError(err error) *Logger {
	return &Logger{l.SugaredLogger.With("error", err.Error())}
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(msg string, args ...interface{}) {
	l.SugaredLogger.Fatalw(msg, args...)
	os.Exit(1)
}

// Sync flushes any buffered log entries
func (l *Logger) Sync() error {
	return l.SugaredLogger.Sync()
}
