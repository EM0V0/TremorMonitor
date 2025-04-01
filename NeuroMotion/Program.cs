using System;

namespace NeuroMotion
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello World!");
            MySQLHelper helper = new MySQLHelper();
            helper.Close();
        }
    }
}