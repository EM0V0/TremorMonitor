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
    }
}
