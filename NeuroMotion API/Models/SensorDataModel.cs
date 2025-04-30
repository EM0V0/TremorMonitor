using System;
using System.ComponentModel.DataAnnotations;

public class SensorData
{
    [Key]
    public int UserID { get; set; }

    [Required]
    public float TremorPower { get; set; }

    [Required]
    public float TremorIndex { get; set; }

    [Required]
    public DateTime CurrentTime { get; set; }
}
