using System;
using System.Configuration;
using MySql.Data.MySqlClient;

namespace NeuroMotion
{
    public class MySQLHelper
    {
        private MySqlConnection connection;

        public MySQLHelper()
        {
            string connString = ConfigurationManager.ConnectionStrings["RDSConnectionString"].ConnectionString;

            try
            {
                connection = new MySqlConnection(connString);
                Console.WriteLine("Connecting to RDS MySQL...");
                connection.Open();
                

                using (var cmd = new MySqlCommand("SELECT NOW();", connection))
                {
                    var result = cmd.ExecuteScalar();
                    Console.WriteLine("Connection Successful! Server Time: " + result);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Connection failed: " + ex.Message);
            }
        }

        public void Close()
        {
            if (connection != null && connection.State == System.Data.ConnectionState.Open)
            {
                connection.Close();
                Console.WriteLine("Connection closed.");
            }
        }

        private bool TableExists(string tableName)
        {
            string query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @tableName;";
            using (var cmd = new MySqlCommand(query, connection))
            {
                cmd.Parameters.AddWithValue("@tableName", tableName);
                var count = Convert.ToInt32(cmd.ExecuteScalar());
                return count > 0;
            }
        }

        public void CreateTableIfNotExists(string tableName)
        {
            // Define the SQL query to create the table, modify this based on actual table
            string createTableQuery = @"
                    CREATE TABLE NeuroData (
                        Id INT AUTO_INCREMENT PRIMARY KEY,
                        Name VARCHAR(100) NOT NULL,
                        Value VARCHAR(100) NOT NULL,
                        Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    );";

            if (!TableExists(tableName))
            {
                using (var cmd = new MySqlCommand(createTableQuery, connection))
                {
                    cmd.ExecuteNonQuery();
                    Console.WriteLine($"Table {tableName} created successfully.");
                }
            }
            else
            {
                Console.WriteLine($"Table {tableName} already exists.");
            }
        }

        public void CreateUserTableIfNotExists(string tableName)
        {
            // Define the SQL query to create the table, modify this based on actual table
            string createTableQuery = @"
                    CREATE TABLE Users (
                        Id INT AUTO_INCREMENT PRIMARY KEY,
                        Name VARCHAR(100) NOT NULL,
                        Value VARCHAR(100) NOT NULL,
                        Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    );";

            if (!TableExists(tableName))
            {
                using (var cmd = new MySqlCommand(createTableQuery, connection))
                {
                    cmd.ExecuteNonQuery();
                    Console.WriteLine($"Table {tableName} created successfully.");
                }
            }
            else
            {
                Console.WriteLine($"Table {tableName} already exists.");
            }
        }

        public void AddData(string name, string value)
        {
            string query = "INSERT INTO NeuroData (Name, Email) VALUES (@name, @email);";
            using (var cmd = new MySqlCommand(query, connection))
            {
                cmd.Parameters.AddWithValue("@name", name);
                cmd.Parameters.AddWithValue("@value", value);
                cmd.ExecuteNonQuery();
                Console.WriteLine($"Data added {name} {value}");
            }
        }

        public void ReadData()
        {
            string query = "SELECT * FROM Users;";
            using (var cmd = new MySqlCommand(query, connection))
            {
                using (var reader = cmd.ExecuteReader())
                {
                    Console.WriteLine("Users:");
                    while (reader.Read())
                    {
                        Console.WriteLine($"Id: {reader["Id"]}, Name: {reader["Name"]}, Email: {reader["Email"]}");
                    }
                }
            }
            
        }
    }
}
