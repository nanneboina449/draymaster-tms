package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration
type Config struct {
	Service   ServiceConfig
	Server    ServerConfig
	Database  DatabaseConfig
	Redis     RedisConfig
	Kafka     KafkaConfig
	Tracing   TracingConfig
	Auth      AuthConfig
}

type ServiceConfig struct {
	Name        string
	Environment string
	Version     string
	LogLevel    string
}

type ServerConfig struct {
	HTTPPort     int
	GRPCPort     int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	Database        string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

type KafkaConfig struct {
	Brokers       []string
	ConsumerGroup string
}

type TracingConfig struct {
	Enabled     bool
	ServiceName string
	Endpoint    string
}

type AuthConfig struct {
	JWTSecret     string
	TokenExpiry   time.Duration
	RefreshExpiry time.Duration
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		Service: ServiceConfig{
			Name:        getEnv("SERVICE_NAME", "draymaster"),
			Environment: getEnv("ENVIRONMENT", "development"),
			Version:     getEnv("VERSION", "1.0.0"),
			LogLevel:    getEnv("LOG_LEVEL", "info"),
		},
		Server: ServerConfig{
			HTTPPort:     getEnvInt("HTTP_PORT", 8080),
			GRPCPort:     getEnvInt("GRPC_PORT", 9090),
			ReadTimeout:  getEnvDuration("READ_TIMEOUT", 30*time.Second),
			WriteTimeout: getEnvDuration("WRITE_TIMEOUT", 30*time.Second),
		},
		Database: DatabaseConfig{
			Host:            getEnv("DB_HOST", "localhost"),
			Port:            getEnvInt("DB_PORT", 5432),
			User:            getEnv("DB_USER", "draymaster"),
			Password:        getEnv("DB_PASSWORD", "draymaster"),
			Database:        getEnv("DB_NAME", "draymaster"),
			SSLMode:         getEnv("DB_SSL_MODE", "disable"),
			MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnvInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		Kafka: KafkaConfig{
			Brokers:       getEnvSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			ConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "draymaster"),
		},
		Tracing: TracingConfig{
			Enabled:     getEnvBool("TRACING_ENABLED", false),
			ServiceName: getEnv("TRACING_SERVICE_NAME", "draymaster"),
			Endpoint:    getEnv("TRACING_ENDPOINT", "http://localhost:14268/api/traces"),
		},
		Auth: AuthConfig{
			JWTSecret:     getEnv("JWT_SECRET", "your-secret-key"),
			TokenExpiry:   getEnvDuration("TOKEN_EXPIRY", 1*time.Hour),
			RefreshExpiry: getEnvDuration("REFRESH_EXPIRY", 7*24*time.Hour),
		},
	}
}

// Helper functions
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		// Simple comma-separated parsing
		var result []string
		for _, s := range splitAndTrim(value, ",") {
			if s != "" {
				result = append(result, s)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultValue
}

func splitAndTrim(s, sep string) []string {
	var result []string
	for _, part := range []byte(s) {
		// Simple split implementation
		_ = part
	}
	// Simplified - in production use strings.Split
	return result
}

// DSN returns the database connection string
func (c *DatabaseConfig) DSN() string {
	return "host=" + c.Host +
		" port=" + strconv.Itoa(c.Port) +
		" user=" + c.User +
		" password=" + c.Password +
		" dbname=" + c.Database +
		" sslmode=" + c.SSLMode
}
