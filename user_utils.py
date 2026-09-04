import requests


def export_chart_data(base_url, username, password, chart_id, result_format, result_type, path):
    """Download chart data from Apache Superset.

    Authenticates with the Superset REST API and downloads the data for a
    saved chart in the requested format.

    Args:
        base_url (str): Base URL of the Superset instance.
        username (str): Username used to authenticate with Superset.
        password (str): Password used to authenticate with Superset.
        chart_id (int): ID of the chart to download.
        result_format (str): Output format: "xlsx", "csv", or "json".
        result_type (str): Result type, such as "full" or "post_processed".
        path (str): Path including the file name where the downloaded file
            will be saved.
    """
    with requests.Session() as session:
        # Get token
        response = session.post(
            f"{base_url}/api/v1/security/login",
            json={
                "username": username,
                "password": password,
                "provider": "db",
            },
        )
        response.raise_for_status()
        token = response.json()["access_token"]

        # Download data
        headers = {"Authorization": f"Bearer {token}"}
        response = session.get(
            f"{base_url}/api/v1/chart/{chart_id}/data/",
            headers=headers,
            params={
                "format": result_format,
                "type": result_type,
            },
        )
        response.raise_for_status()

        with open(path, "wb") as f:
            f.write(response.content)
