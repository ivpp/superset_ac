"""
Based on https://github.com/dpgaspar/Flask-AppBuilder/blob/master/flask_appbuilder/security/views.py

Idea:
- https://github.com/apache/superset/discussions/32991
- https://gist.github.com/orangewolf/762aaadabdaedd98e14d5f4e0cbe5ee1

Combine AuthDBView and AuthOAuthView

"""

import os
from typing import Optional
import logging
from superset.security import SupersetSecurityManager
from flask_appbuilder.security.views import AuthOAuthView
from flask import current_app, flash, g, redirect, request, session, url_for
from flask_login import login_user, logout_user
from flask_appbuilder._compat import as_unicode
from flask_appbuilder.security.decorators import no_cache
from flask_appbuilder.security.forms import LoginForm_db
from flask_appbuilder.security.utils import generate_random_string
from flask_appbuilder.utils.base import get_safe_redirect
from flask_appbuilder.views import expose
from flask_babel import lazy_gettext
import jwt
from werkzeug.wrappers import Response as WerkzeugResponse
from urllib.parse import urlencode



logger = logging.getLogger(__name__)



class CustomAuthSsoOAuthView(AuthOAuthView):

    invalid_oauth_logout_message = lazy_gettext("Invalid OAuth logout.")

    @expose("/logout/")
    def logout(self):
        logout_user()
        auth_type = session.get("auth_type")
        if auth_type == "AUTH_DB":
            session.clear()
            return redirect(self.appbuilder.get_url_for_index)
        else:
            try:
                id_token = session.get("oauth_id_token")
                session.clear()
                params = {
                    "client_id": os.environ.get('OAUTH_CLIENT_ID'),
                    "post_logout_redirect_uri": url_for(f"{type(self).__name__}.login", _external=True),
                }
                if id_token:
                    params["id_token_hint"] = id_token
                return redirect(f"{current_app.config['OAUTH_SERVER_LOGOUT_URL']}?{urlencode(params)}")
            except Exception as e:
                logger.exception("Error on OAuth logout: %s", e)
                flash(as_unicode(self.invalid_oauth_logout_message), "warning")
                return redirect(self.appbuilder.get_url_for_index)



class CustomAuthSsoDbOAuthView(CustomAuthSsoOAuthView):

    invalid_login_message = lazy_gettext("Invalid login. Please try again.")

    @expose("/login/", methods=["GET", "POST"])
    @expose("/login/<provider>")
    @no_cache
    def login(self, provider: Optional[str] = None) -> WerkzeugResponse:
        
        if g.user is not None and g.user.is_authenticated:
            return redirect(self.appbuilder.get_url_for_index)

        # DB authentication    
        form = LoginForm_db()          
        if form.validate_on_submit():
            next_url = get_safe_redirect(request.args.get("next", ""))
            user = self.appbuilder.sm.auth_user_db(
                form.username.data, form.password.data
            )
            if not user:
                flash(as_unicode(self.invalid_login_message), "warning")
                return redirect(self.appbuilder.get_url_for_login_with(next_url))
            login_user(user, remember=False)
            session["auth_type"] = "AUTH_DB"
            return redirect(next_url)
        
        # OAuth authentication 
        if provider:
            random_state = generate_random_string()
            state = jwt.encode(
                request.args.to_dict(flat=False), random_state, algorithm="HS256"
            )
            session["oauth_state"] = random_state
            try:
                return self.appbuilder.sm.oauth_remotes[provider].authorize_redirect(
                    redirect_uri=url_for(
                        ".oauth_authorized", provider=provider, _external=True
                    ),
                    state=state.decode("ascii") if isinstance(state, bytes) else state,
                )
            except Exception as e:
                logger.exception("Error on OAuth authorize: %s", e)
                flash(as_unicode(self.invalid_login_message), "warning")
                return redirect(self.appbuilder.get_url_for_index)

        return self.render_template(
            self.login_template, title=self.title, form=form, appbuilder=self.appbuilder
        )



class CustomSsoSecurityManager(SupersetSecurityManager):
    """
    SSO with Keycloak
    """

    authoauthview = CustomAuthSsoOAuthView

    def set_oauth_session(self, provider, oauth_response):
        result = super().set_oauth_session(provider, oauth_response)
        if provider == "keycloak" and oauth_response:
            id_token = oauth_response.get("id_token")
            if id_token:
                session["oauth_id_token"] = id_token
        return result

    def oauth_user_info(self, provider, response=None):
        if provider == 'keycloak':
            me = self.appbuilder.sm.oauth_remotes[provider].userinfo()
            return {
                'username': me['email'],
            }



class CustomSsoDbSecurityManager(CustomSsoSecurityManager):
    """
    SSO with Keycloak or DB login
    """
    authoauthview = CustomAuthSsoDbOAuthView
